open Langs
open Utils
open Prune

open Util.Source
open Backend_interpreter

(** Helpers **)
let flatten_rec =
  List.concat_map (fun def ->
    match def.it with
    | Il.Ast.RecD defs -> defs
    | _ -> [ def ]
  )

let string_of_section s = match s with
| Al.Ast.ListV vs ->
  (match !vs with
  | [||] -> ""
  | vs -> (vs |> Array.to_list |> List.map Al.Print.string_of_value |> String.concat "\n  ") ^ "\n"
  )
| _ -> Al.Print.string_of_value s

let string_of_module m = match m with
| Al.Ast.CaseV ("MODULE", sections) ->
  "(MODULE\n  " ^ (List.map string_of_section sections |> String.concat "\n  ") ^ "\n)"
| _ -> failwith "Unreachable"

exception FuzzTimeout
let fuzz_start = ref 0.0
let timeout () =
  if !Flag.time >= 0 && Unix.time () -. !fuzz_start >= float_of_int !Flag.time then
    true
  else
    false

(** Generation **)
let gen_modules () =
  try_n 10 "Generating modules" @@ fun () -> Some (
  let open Flag in
  let approach =
    match !approach with
    | Hybrid -> if !cur_seed mod 100 = 0 then TopDown else BottomUp
    | a -> a
  in
  match approach with
  | BottomUp -> [Bottom_up.gen_module [""; ""]]
  | TopDown -> Top_down.gen_modules !module_num
  | _ -> []
  )

(** Mutation **)
let patch = Patch.patch_module

(** Injection **)
let inject = Inject.inject

let rec trim modules resutls =
  match modules, resutls with
  | [], [] -> [], []
  | x :: xs, y :: ys ->
    let xs', ys' =
      match y with
      | Ok _ -> trim xs ys
      | _ -> [], []
    in
    x :: xs', y :: ys'
  | _ -> failwith "unreachable"

(** Output **)
let print_invoke_result (fname, args, result) =
  let trace_log =
    match result with
    | Ok return_values ->
      Printf.sprintf "(assert_return (invoke %s [%s]) [%s])"
        fname
        (Al.Print.string_of_values " " args)
        (Al.Print.string_of_values " " return_values)
    | Error Exception.Trap ->
      Printf.sprintf "(assert_trap (invoke %s [%s]))"
        fname
        (Al.Print.string_of_values " " args)
    | Error Exception.Throw ->
      Printf.sprintf "(assert_exception (invoke %s [%s]))"
        fname
        (Al.Print.string_of_values " " args)
    | Error e ->
      Printf.sprintf "(invoke %s [%s]) failed due to %s"
        fname
        (Al.Print.string_of_values " " args)
        (Printexc.to_string e) in
  Log.trace trace_log

let print_result = function
  | Error Exception.Trap -> Log.trace "Instantiation trapped"
  | Error Exception.Exhaustion -> Log.trace "Infinite loop in instantiation"
  | Error e ->
    Log.trace ("Unexpected error during instantiation: " ^ Printexc.to_string e)
  | Ok results ->
    Log.trace "Instantiation success";
    List.iter print_invoke_result results

let print_module module_ =
  Log.trace (string_of_module module_)

let to_phrase x = Reference_interpreter.Source.(x @@ no_region)

let value_to_script v =
  let open Reference_interpreter in
  let open Script in
  let open Value in

  let f32_pos_nan = F32.to_bits F32.pos_nan in
  let f32_neg_nan = F32.to_bits F32.neg_nan |> Int32.logand 0x0000_0000_ffff_ffffl in
  let f64_pos_nan = F64.to_bits F64.pos_nan in
  let f64_neg_nan = F64.to_bits F64.neg_nan in

  match v with
  | Al.Ast.CaseV ("REF.FUNC_ADDR", _) -> RefResult (RefTypePat FuncHT) |> to_phrase
  | _ ->
    match Construct.al_to_value v with
    | Num n -> NumResult (NumPat (n |> to_phrase)) |> to_phrase
    | Ref r -> RefResult (RefPat (r |> to_phrase)) |> to_phrase
    (* TODO: Check implementattion *)
    | Vec (V128 i) ->
      let i32 i = NumPat (to_phrase (I32 i)) in
      let i64 i = NumPat (to_phrase (I64 i)) in
      let f32 f =
        if f32_pos_nan = (F32.to_bits f) || f32_neg_nan = (F32.to_bits f) then
          NanPat (to_phrase (F32 CanonicalNan))
        else if Int32.logand (F32.to_bits f) f32_pos_nan = f32_pos_nan then
          NanPat (to_phrase (F32 ArithmeticNan))
        else
          NumPat (to_phrase (F32 f))
      in
      let f64 f =
        if f64_pos_nan = (F64.to_bits f) || f64_neg_nan = (F64.to_bits f) then
          NanPat (to_phrase (F64 CanonicalNan))
        else if Int64.logand (F64.to_bits f) f64_pos_nan = f64_pos_nan then
          NanPat (to_phrase (F64 ArithmeticNan))
        else
          NumPat (to_phrase (F64 f))
      in
      match choose [ "I8"; "I16"; "I32"; "I64"; "F32"; "F64" ] with
      | "I8" ->  to_phrase (VecResult (VecPat (V128 (V128.I8x16 (), List.map i32 (V128.I8x16.to_lanes i)))))
      | "I16" -> to_phrase (VecResult (VecPat (V128 (V128.I16x8 (), List.map i32 (V128.I16x8.to_lanes i)))))
      | "I32" -> to_phrase (VecResult (VecPat (V128 (V128.I32x4 (), List.map i32 (V128.I32x4.to_lanes i)))))
      | "I64" -> to_phrase (VecResult (VecPat (V128 (V128.I64x2 (), List.map i64 (V128.I64x2.to_lanes i)))))
      | "F32" -> to_phrase (VecResult (VecPat (V128 (V128.F32x4 (), List.map f32 (V128.F32x4.to_lanes i)))))
      | "F64" -> to_phrase (VecResult (VecPat (V128 (V128.F64x2 (), List.map f64 (V128.F64x2.to_lanes i)))))
      | _ -> failwith "hi"

let invoke_to_script (f, args, result) =
  let open Reference_interpreter.Script in
  let f' = Reference_interpreter.Utf8.decode f in
  let args' = List.map (Construct.al_to_value %> to_phrase) args in
  let action = Invoke (None, f', args') |> to_phrase in
  match result with
  | Ok returns -> Some (AssertReturn (action, List.map value_to_script returns))
  (* | Error Exception.Exhaustion -> Some (AssertExhaustion (action, "")) *)
  | Error Exception.Exhaustion -> None
  | Error Exception.Timeout -> None
  | Error Exception.OutOfMemory -> None
  | Error Exception.Trap -> Some (AssertTrap (action, ""))
  | Error Exception.Throw -> Some (AssertException action)
  | Error e ->
    Printf.sprintf "Unexpected error in invoking %s of %d.wast %s" f !Flag.cur_seed (Printexc.to_string e) |> prerr_endline;
    None

let to_script' i al_module result =
  let open Reference_interpreter.Script in

  let module_ = Construct.al_to_module al_module in
  let module_empty = Construct.al_to_module (empty_module ()) in

  let def = Textual (module_, []) |> to_phrase in
  let def_empty = Textual(module_empty, []) |> to_phrase in

  match result with
  | Ok assertions ->
    [ Module (None, def) |> to_phrase ] @
    [ Instance (None, None) |> to_phrase ] @
    (* Convention: ith module's name is "M$i" *)
    [ Register ([77; 48 + i], None) |> to_phrase ] @
    (List.filter_map invoke_to_script assertions |> List.map (fun a -> Assertion (to_phrase a) |> to_phrase))
  | Error Exception.Trap ->
    [ Assertion (AssertUninstantiableInlined (def, "") |> to_phrase) |> to_phrase ]
  | Error Exception.Exhaustion ->
    [ Module (None, def_empty) |> to_phrase  (* TODO: Exhaustion *) ]
  | Error Exception.Timeout ->
    [ Module (None, def_empty) |> to_phrase  (* TODO: Timeout *) ]
  | Error Backend_interpreter.Exception.Invalid(e, _) ->
    raise e
  | Error e ->
    raise e
    (* Printf.sprintf "Unexpected error in instantiating module: %s" (Printexc.to_string e) |> prerr_endline; *)
    (* [ Module (None, def) |> to_phrase ] *)
let to_script al_modules results =
  let rec aux i xs ys =
    match xs, ys with
    | [], [] -> []
    | x :: xs', y :: ys' -> to_script' i x y @ aux (i+1) xs' ys'
    | _ -> failwith "unreachable"
  in

  aux 0 al_modules results

let write_script seed script =
  let name = string_of_int seed in

  let dir = !Flag.out in
  if not (Sys.file_exists dir && Sys.is_directory dir) then
    Sys.mkdir dir 0o755;
  let file = Filename.concat dir (name ^ ".wast") in
  let oc = open_out file in
  begin try
    Reference_interpreter.Print.script oc 80 `Textual script;
    close_out oc
  with exn ->
    close_out oc;
    Sys.remove file;
    raise exn
  end;

  let file = Filename.concat dir (name ^ ".js") in
  let oc = open_out file in
  begin try
    let js = Reference_interpreter.Js.of_script script in
    output_string oc js;
    close_out oc
  with exn ->
    close_out oc;
    Sys.remove file;
    raise exn
  end

let rm_file name =
  let dir = !Flag.out in
  let wast = Filename.concat dir (name ^ ".wast") in
  if Sys.file_exists wast then Sys.remove wast;
  let js = Filename.concat dir (name ^ ".js") in
  if Sys.file_exists js then Sys.remove js

let remove_script seed =
  rm_file (string_of_int seed);
  rm_file (string_of_int seed ^ "-e");
  List.init 10 (fun i -> rm_file (string_of_int seed ^ "-e0" ^ string_of_int i)) |> ignore

let run_file file =
  let open Backend_interpreter.Runner in

  if Filename.extension file <> ".wast" then () else

  (*
  let jsfile = Filename.chop_suffix file ".wast" ^ ".js" in

  (* TODO: Fix this coarse filtering *)
  let open Conform_test in
  let cmd = extract_cmd () in
  let arg = if requires_js () then jsfile else file in
  let (_, _, st) = run_command @@ cmd ^ " " ^ arg in
  (* Engine Error -> likely contain unsupported -> ignore *)
  if st <> WEXITED 0 then Log.debug @@ "Failed to run official test: " ^ file else
  *)

  run ~silent:true [file]

let run_dir dir =
  dir
  |> Sys.readdir
  |> Array.to_list
  |> List.sort compare
  |> List.iter (fun filename -> run_file (Filename.concat dir filename))

let measure_official_coverage () =
  Ds.Info.init ();
  run_dir "official-test";
  Ds.Info.print_uncovered ()

(* Generate tests *)

let gen_test el' il' al' elab_env =
  (* Register spec *)
  el := el';
  il := flatten_rec il';
  al := al';

  orig_il := !il;

  el_env := Some elab_env;
  il_env := Il.Env.env_of_script il';

  (* Initialize *)
  (* Top_down.rts := List.map Top_down.get_rt (get_typing_rules ()); *)
  Utils.estimate_const ();
  let st = Sys.time () in
  let times = ref [] in
  Printexc.register_printer (function
    | UnifyFail (e1, e2) ->
      Some (Printf.sprintf "UnifyFail(%s, %s)" (Il.Print.string_of_exp e1) (Il.Print.string_of_exp e2))
    | _ -> None
  );
  Ds.init !al;
  Backend_interpreter.Interpreter.set_timeout (Some 3.0);
  Backend_interpreter.Interpreter.set_step_limit (Some 50000);
  fuzz_start := Unix.time ();

  let seeds =
    match !Flag.seeds with
    | "" -> List.init !Flag.n (fun i -> !Flag.seed + i)
    | filename -> read_ints filename
  in

  (try List.iter (fun seed ->
    if timeout () then raise FuzzTimeout;

    try (
      (if !Flag.seeds <> "" || seed mod 100 = 0 then Log.info else Log.debug)
        ("=== Generating " ^ string_of_int seed ^ ".wast... ===");

      (* Set random seed *)
      Random.init seed;
      Flag.cur_seed := seed;

      (* Prune production grammar for swarm testing *)
      il := if !Flag.swarm then prune_il !orig_il else !orig_il;

      (* Generate test *)
      let modules = gen_modules () in

      (* Mutatiion *)
      let modules = List.map patch modules in

      (* Initialize *)
      Ds.Store.init ();
      Ds.Register.init ();

      (* TODO *)
      Builtin.builtin () |> ignore;

      (* Injection *)
      let results = inject modules in

      (* Trim: If a module instantiation fails, remove any modules after that *)
      let modules, results = trim modules results in

      (* Dynamic Patch *)
      let modules, results = List.map2 Dynamic_patch.patch modules results |> List.split in

      (* Print module *)
      List.iter print_module modules;

      (* Print result *)
      List.iter print_result results;

      (* Convert to script *)
      let script = to_script modules results in

      (* Convert to Wast *)
      write_script seed script;

      (* Conform test *)
      Conform_test.conform_test seed;

      (* Record time *)
      times := Sys.time () -. st :: !times;

      (* Cleanup *)
      if !Flag.clean then remove_script seed;

    ) with
    | e ->
      (* Printexc.print_backtrace stderr; *)
      Log.warn @@
      " " ^ (Filename.concat !Flag.out ((string_of_int seed) ^ ".wast")) ^ ":0.0-0.0: " ^
      "west error: " ^ Printexc.to_string e;
  ) seeds
  with | FuzzTimeout -> Log.info "=== Fuzz Timeout ===");

  (* Print Coverage *)
  if !Flag.cov then (
    Ds.Info.print_uncovered ();
    measure_official_coverage ()
  );

  (* Print time *)
  let file = Filename.concat !Flag.out "time.txt" in
  let oc = open_out file in
  output_string oc (List.rev !times |> List.map string_of_float |> String.concat "\n");
  close_out oc
