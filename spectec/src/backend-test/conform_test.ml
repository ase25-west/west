open Unix
open Thread

open Utils


let env = environment ()

let has_substring str sub =
  let len_s = String.length str in
  let len_sub = String.length sub in
  let rec aux i =
    if i > len_s - len_sub then false
    else if String.sub str i len_sub = sub then true
    else aux (i + 1)
  in
  aux 0

let has_substring_from str subs =
  List.exists (has_substring str) subs

let extract_cmd () =
  match !Flag.target with
  | Ref      -> "../interpreter/wasm"
  | Wasmtime -> "wasmtime wast -W all-proposals=y"
  | Wasmer   -> "wasmer wast"
  | Wasmedge -> failwith "TODO"
  | V8       -> "/root/v8/v8/out/x64.release/d8 --experimental-wasm-exnref"
  | Jsc      -> "jsc --useWasmRelaxedSIMD=true"
  | Sm       -> "/root/gecko-dev/mach run"

let requires_js () =
  match !Flag.target with
  | Ref
  | Wasmtime
  | Wasmer
  | Wasmedge -> false
  | V8
  | Jsc
  | Sm -> true

let program = ref ""

let classify err =
  (* reference interpreter *)
  if has_substring err "runtime crash: type mismatch for element" then
    Some "reference interpreter: return_call_indirect"
  else if has_substring err "indirect calls must go through a table with type <= funcref" then
    Some "reference interpreter: return_call_indirect"
  else if has_substring err "Wasm.Data.Bounds" then
    Some "reference interpreter: data"
  else if has_substring_from err ["signature mismatch"; "signature doesn't match"; "imported function does not match the expected type"] then
    Some "reference interpreter: float_signature_mismatch"
  (* wasmtime *)
  else if has_substring err "unrecoverable error when allocating" then
    Some "wasmtime: v128_array_ref_table_initializer"
  else if has_substring err "expected trap, got Core(" then
    Some "wasmtime: out_of_bound_table_none_reference"
  else if has_substring err "non-constant operator" then
    Some "wasmtime: non_constant_operator"
  else if has_substring err "panicked at cranelift/codegen" then
    Some "wasmtime: export_long_result_type_func"
  (* Unsupported *)
  else if has_substring err "exception handling feature" then
    Some "wasmtime: unsupported exc"
  else if has_substring err "exceptions" then
    Some "wasmtime: unsupported exc"
  else if has_substring err "RefNull" then
    Some "wasmtime: unsupported RefNull"
  else if has_substring err "requested allocation's alignment of 16 is greater than max supported alignment of 8" then
    Some "wasmtime: unsupported alignment"
  (* wasmer *)
  else if has_substring err "(data " then
    Some "wasmer: empty_passive_data"
  else if !Flag.target = Wasmer && has_substring err "multiple memories" && has_substring !program "memory $1" then (* west error *)
    Some "west error: imported memory + own memory is not allowed in wasmer"
  (* wasm3 *)
  else if has_substring err "Syntax Error" then
    Some "wasm3: syntax error"
  else if has_substring err "wast2json failed" then
    Some "wasm3: wast2json failed"
  else if has_substring err "JSONDecodeError" then
    Some "wasm3: wast2json generated malformed JSON"
  else if has_substring_from err ["unknown value_type"; "'fd' not available"] then
    Some "wasm3: unsupported SIMD"
  else if has_substring err "element table index must be zero for MVP" then
    Some "wasm3: unsupported reference types"
  (* spider monkey error *)
  else if has_substring err "TypeError: cannot pass value to or from JS" then
    Some "sm: nullexnref"
  else if has_substring err "table with non-nullable references requires initializer" then
    Some "sm: import_table_non_null_ref"
  else if has_substring err "expression has type exnref but expected (ref exn)" then
    Some "sm: non_null_catch_ref"
  (* v8 error *)
  else if has_substring err "TypeError: type incompatibility when transforming from/to JS" then
    Some "v8: nullexnref"
  (* jsc error *)
  else if has_substring err "throw_ref expected an exception reference" then
    Some "jsc: non_null_throw_ref"
  else if has_substring err "invalid extended simd" then
    Some "jsc: relaxed_SIMD"
  else if has_substring err "Table's type must be defaultable" then
    Some "jsc: import_table_non_null_ref"
  else if has_substring err "Memory section has more than one memory" then (* west error *)
    Some "west error: imported memory + own memory is not allowed in JSC"
  else if has_substring err "there can at most be one Memory section for now" then (* west error *)
    Some "west error: imported memory + own memory is not allowed in JSC"
  else

  let invalid_return_jsc =
    !Flag.target = Jsc && has_substring err "Wasm validate failure"
    && has_substring_from !program ["(return"; "(unreachable"; "(br"; "(throw"]
  in

  (* These may be false positves *)
  if has_substring err "invalid extended GC op" then
    Some "jsc: return_gc_instr"
  else if invalid_return_jsc && has_substring !program "try_table" then
    Some "jsc: return_try_table"
  else if invalid_return_jsc && has_substring !program "ref.null" then
    Some "jsc: return_ref.null"

  else if err = ""
    && !Flag.target = Jsc
    && has_substring_from !program ["struct.get"; "array.get"]
    && has_substring !program "v128"
    && has_substring !program "null" then
    Some "jsc: null_get"
  else if !Flag.target = Jsc
    && has_substring err "Unreachable code should not be executed (evaluating 'action()')"
    && has_substring !program "ref.i31"
    && has_substring !program "v128" then
    Some "jsc: large_i31_ref_v128_param"
  else if !Flag.target = Jsc
    && has_substring err "Wasm return value 1 expected, got 0"
    && has_substring !program "ref.i31"
    && has_substring !program "v128" then
    Some "jsc: wrap_large_i31_ref_v128_param"
  else if has_substring err "RuntimeError: Cannot get value of exnref global" then
    Some "jsc: exnref_global"
  else if err = ""
    && !Flag.target = Jsc
    && has_substring !program "throw_ref"
    && has_substring !program "v128"
    && has_substring_from !program ["block"; "loop"; "if"; "try_table"] then
    Some "jsc: v128_local_block_throw_ref"
  (* west error *)
  else if has_substring err "expected `)`" then
    Some "Syntax Error"
  else if has_substring err "expected keyword" then
    Some "Syntax Error"
  else if has_substring err "unexpected token" then
    Some "Syntax Error"
  (* reference interpreter *)
  else if has_substring !program "return_call_indirect" then
    Some "reference interpreter: return_call_indirect"
  (* Nondeterminism *)
  else if has_substring !program "relaxed" then
    Some "nondeterminism: relaxed_simd"
  else if !Flag.target = Jsc
    && has_substring err "Unreachable code should not be executed (evaluating 'action()')"
    && has_substring_from !program ["nan:0x40_0001"] then
    Some "nondeterminism: NaN"
  else if has_substring err "expected V128(" && has_substring_from !program ["f32x"; "f64x"] then
    Some "nondeterminism: float_simd"
  else if has_substring err "RuntimeError: Unreachable code should not be executed (evaluating 'action()')" && has_substring_from !program ["f32x"; "f64x"] then
    Some "nondeterminism: float_simd"
  else if !Flag.target = V8
    && has_substring err "RuntimeError: unreachable"
    && has_substring_from !program ["f32."; "f64."; "f32x"; "f64x"] then
    Some "nondeterminism: float_simd"
  else if !Flag.target = Sm
    && has_substring err "RuntimeError: unreachable"
    && has_substring_from !program ["f32."; "f64."; "f32x"; "f64x"] then
    Some "nondeterminism: float_simd"
  else
    None

let read_process_output process_out =
  let buf = Buffer.create 1024 in
  let rec read_loop () =
    try
      let line = input_line process_out in
      Buffer.add_string buf (line ^ "\n");
      read_loop ()
    with End_of_file -> ()
  in
  read_loop ();
  Buffer.contents buf

let run_command ?(timeout=3.0) cmd =
  let (stdout_r, stdout_w) = pipe () in
  let (stderr_r, stderr_w) = pipe () in
  match fork () with
  | 0 ->
      (* Child process *)
      dup2 stdout_w stdout;
      dup2 stderr_w stderr;
      close stdout_r;
      close stderr_r;
      let argv = cmd |> String.split_on_char ' ' |> Array.of_list in
      ignore (execvp argv.(0) argv);
      raise Thread.Exit  (* Only reached if execvp fails *)
  | pid ->
      (* Parent process *)
      close stdout_w;
      close stderr_w;

      let stdout_chan = in_channel_of_descr stdout_r in
      let stderr_chan = in_channel_of_descr stderr_r in

      let stdout_content = ref "" in
      let stderr_content = ref "" in
      let exit_status = ref (WEXITED 127) in

      let stdout_thread = create (fun () -> stdout_content := read_process_output stdout_chan) () in
      let stderr_thread = create (fun () -> stderr_content := read_process_output stderr_chan) () in

      let start_time = gettimeofday () in
      let rec wait_for_process () =
        match waitpid [WNOHANG] pid with
        | 0, _ ->
            if gettimeofday () -. start_time > timeout then begin
              kill pid Sys.sigkill;
              let _ = waitpid [] pid in
              exit_status := WEXITED 124
            end else begin
              sleepf 0.01; (* Small delay to prevent CPU spin *)
              wait_for_process ()
            end
        | _, status -> exit_status := status
      in

      wait_for_process ();

      join stdout_thread;
      join stderr_thread;

      close stdout_r;
      close stderr_r;

      (!stdout_content, !stderr_content, !exit_status)

let test_engine engine wast =
  let cmd = engine ^ " " ^ wast in
  Log.debug cmd;

  let (out, err, st) = run_command cmd in

  Log.debug ("[Stdout]\n" ^ out);
  Log.debug ("[Stderr]\n " ^ err);
  match st with
  | WEXITED 124 -> Log.warn ("`" ^ cmd ^ "` failed: Timeout")
  | WEXITED 0 -> ()
  | _ ->
    (match classify (out ^ err) with
    (* | Some _ -> () *)
    | Some c -> Log.warn ("`" ^ cmd ^ "` failed: " ^ c)
    | None -> Log.warn ("`" ^ cmd ^ "` failed: " ^ out ^ "\n" ^ err)
    )

let conform_test seed =
  let wast = Printf.sprintf "%s/%d.wast" !Flag.out seed in
  let js = Printf.sprintf "%s/%d.js" !Flag.out seed in

  program := read_file wast;

  let cmd = extract_cmd () in
  let arg = if requires_js () then js else wast in

  test_engine cmd arg
