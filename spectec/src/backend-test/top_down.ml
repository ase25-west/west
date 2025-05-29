open Langs
open Utils
open Valid

open Util
open Source

open Il.Ast
open Il.Print

open Xl.Atom

(* Helpers *)
let hds xs = xs |> List.rev |> List.tl |> List.rev

let option_flatmap f opt = Option.bind opt f

let (-->) p q = (not p) || q

let spf = Printf.sprintf

let version = Flag.version

let nullary x t = il_case x t []
let unary x t a = il_case x t [a]

(** Helpers to handle type-family-based generation **)
  let has_name name def =
    match def.it with
    | TypD (id, _params, insts) when id.it = name -> Some insts
    | _ -> None
  let type_of_exp e =
    match e.it with
    | SubE (_, t, _) -> t
    | _ -> e.note
  let type_of_arg a =
    match a.it with
    | ExpA e -> type_of_exp e
    | TypA _ -> failwith "TODO"
    | DefA _ -> failwith "TODO"
    | GramA _ -> failwith "TODO"
  let typ_of_bind bind =
    match bind.it with
    | ExpB (_, t) -> t
    | TypB _
    | DefB _
    | GramB _ -> failwith "typ_of_bind"
  let extract_tup_typ typ =
    match typ.it with
    | TupT ets -> List.split ets |> snd
    | _ -> failwith "extract_tup_typ"
  let a2e a =
    match a.it with
    | ExpA e -> e
    | _ -> failwith "Expected an ExpA"
  let e2a e =
    ExpA e $ e.at

  exception DispatchFail of string

  let rec has_deftyp a dt =
    match a.it, dt.it with
    | CaseE (mixop, {it = TupE args; _}), VariantT typcases ->
      List.exists (fun (mixop', (_, typ, _), _) ->
        Xl.Mixop.eq mixop mixop'
        &&
        List.for_all2 has_type args (extract_tup_typ typ)
      ) typcases
    | _, AliasT t -> has_type a t
    | _, VariantT [ [[]; []], ([ bind ], _, _), _ ] -> has_type a (typ_of_bind bind)
    | _ -> false
  and has_type a t =
    Il.Eval.sub_typ !il_env a.note t ||
    match a.it, t.it with
    | NumE _, (NumT `NatT) -> true
    | _, VarT (name, []) -> has_deftyp a (dispatch_deftyp name.it [] |> snd)
    | _ -> false
  and has_argtype a p =
    match a.it, (a2e p).it with
    | CaseE (mixop1, {it = TupE args1; _}), CaseE (mixop2, {it = TupE args2; _}) ->
      Xl.Mixop.eq mixop1 mixop2
      && List.for_all2 has_argtype args1 (List.map e2a args2)
      && has_type a (type_of_arg p)
    | _ ->
      has_type a (type_of_arg p)

  and match_params args inst =
    match inst.it with
    | InstD (_binds, params, deftyp) when (
        List.for_all2 has_argtype args params
      ) -> Some (params, deftyp)
    | _ -> None
  and dispatch_deftyp name args =
    match List.find_map (has_name name) !il with
    | Some insts ->
      ( match List.find_map (match_params args) insts with
        | Some matched -> matched
        | None -> raise (DispatchFail (
          name ^ "(" ^ (args |> List.map (fun e -> string_of_exp e) |> String.concat ", ") ^ ")"
        ))
      )
    | None -> failwith (Printf.sprintf "The syntax named %s does not exist in the input spec" name)
(** End of Helpers to handle type-family-based generation **)

let string_of_atom = Xl.Atom.to_string

let flatten_args e = match e.it with
| Il.Ast.TupE es -> es
| _ -> [ e ]

let nth_typ typs n =
  match typs.it with
  | Il.Ast.TupT ts -> List.nth ts n |> snd
  | _ -> List.nth [typs] n

let replace' ixs = List.mapi (fun i x -> match List.assoc_opt i ixs with Some x' -> x' | None -> x)

(* Exceptions *)
exception ImpossibleCase of atom' (* Indicate that generating certain typecase is impossible *)

(** Initialize **)

let rts = ref Record.empty

let print_rts () =
  Record.iter (fun k v ->
    let (rt1, rt2, (_:(int * string) list)) = v in
    Printf.sprintf "%s : %s -> %s" k (string_of_rt rt1) (string_of_rt rt2) |> print_endline
  ) !rts

(* TODO: automate this? *)
let matches_heaptype ht1 ht2 =
  Debug_log.(log "top_down.heaptype_matches"
    (fun () -> string_of_exp ht1 ^ "<:" ^ string_of_exp ht2)
    string_of_bool
  ) @@ fun _ ->
  let extract_idx e =
    if is_case e && case_of_case e = Atom "_IDX" then
      Some (e |> nth_arg_of_case 0 |> nth_arg_of_case 0 |> exp_to_int)
    else
      None
  in

  (* Optimize *)
  Il.Eq.eq_exp ht1 ht2
  ||
  (* HARDECODE: One of ht is idx *)
  (match extract_idx ht1, extract_idx ht2 with
  | Some tid1, Some tid2 ->
    let ts = !flattened_types_cache in Il.Eq.eq_exp (List.nth ts tid1) (List.nth ts tid2)
  | Some tid1, None ->
    is_case ht2 && case_of_case (List.nth !flattened_types_cache tid1) = case_of_case ht2
  | _ -> false
  )
  ||
  (* Automatically reduce Heaptype_sub *)
  let pr = RulePr (
    "Heaptype_sub" $ no_region,
    [[]; [Turnstile $$ no_region % info ""]; [Sub $$ no_region % info ""]; []],
    il_tup [il_var "C" (mk_VarT "context"); ht1; ht2]
  ) $ no_region in
  reduce_prem pr = []

let matches vt1 vt2 =
  Debug_log.(log "top_down.matches"
    (fun () -> string_of_exp vt1 ^ "<:" ^ string_of_exp vt2)
    string_of_bool
  ) @@ fun _ ->
  match vt1.it, vt2.it with
  | _ when Il.Eq.eq_exp vt1 vt2 -> true
  | VarE _, _ | _, VarE _ -> true
  (* HARDCODE:Reftype_sub *)
  | CaseE ([[{it = Atom "REF"; _}]; []; []], {it = TupE [nul1; ht1]; _}),
    CaseE ([[{it = Atom "REF"; _}]; []; []], {it = TupE [nul2; ht2]; _})
    ->
    (nul1.it = OptE None || nul2.it <> OptE None)
    && matches_heaptype ht1 ht2
  | _ -> false

let rec matches_all vts1 vts2 = match vts1, vts2 with
| [], [] -> true
| hd1 :: tl1, hd2 :: tl2 -> matches_all tl1 tl2 && matches hd1 hd2
| _ -> false

let poppable rt =
  let rec aux l1 l2 =
    match l1, l2 with
    | [], _ -> true
    | hd1 :: tl1, hd2 :: tl2 -> matches hd2 hd1 && aux tl1 tl2 (* hd2 <: hd1 *)
    | _ -> false
  in
  expr_info_stack
  |> top
  |> (fun (x, _, _, _) -> x)
  |> aux (List.rev rt)

let pushable rt =
  let rec aux l1 l2 =
    match l1, l2 with
    | [], _ -> true
    | hd1 :: tl1, hd2 :: tl2 -> matches hd1 hd2 && aux tl1 tl2 (* hd1 <: hd2 *)
    | _ -> false
  in
  expr_info_stack
  |> top
  |> (fun (_, x, _, _) -> x)
  |> aux (List.rev rt)

let rec common_len xs ys =
  match xs, ys with
  | x :: xs', y :: ys' when matches x y -> 1 + common_len xs' ys'
  | _ -> 0

let edit_dist ts1 ts2 =
  let l1 = List.length ts1 in
  let l2 = List.length ts2 in
  let l3 = common_len (List.rev ts1) (List.rev ts2) in
  (l1-l3) + (l2-l3)

let force_stack_type rt1 rt2 =
  let l = common_len rt1 rt2 in
  let rt1' = Lib.List.drop l rt1 in
  let rt2' = Lib.List.drop l rt2 in
  List.map (Fun.const @@ il_case "DROP" "instr" []) rt1' @ List.concat_map default rt2'

(** Seed generation **)

type context = {
  parent_case: atom;    (* Denote case of most recent parent CaseE *)
  parent_name: string;  (* Denote name of most recent production *)
  depth_limit: int;     (* HARDCODE: Limit on block / loop / if depth *)
  (* args: (string * Al.Ast.value) list (* Arguments for syntax *) *)

  (* from bottom up gen *)
  typ: typ;
  args: arg list;
  prems: prem list;
  refer: exp option;
  prev_case_args: exp list;
}
let default_context = {
  parent_case = atomize (Atom "");
  parent_name = "";
  depth_limit = 3;
  args = [];
  prems = [];
  typ = mk_VarT "default";
  refer = None;
  prev_case_args = [];
}

let trules = ref []
let find_trules case =
  List.filter (fun r ->
    let RuleD (id, _, _, _, _) = r.it in
    let case' =
      String.uppercase_ascii id.it
      |> String.split_on_char '-'
      |> List.hd
    in
    case = case'
  ) !trules

let get_deftype_int tid =
  match !version with
  | 3 ->
    let comptypes = !flattened_types_cache in
    List.nth comptypes tid
  | _ -> failwith "Unsupported version for get_deftype"

let get_deftype tid = get_deftype_int (tid |> nth_arg_of_case 0 |> exp_to_int)

let deftype_to_arrow deftype =
  assert (case_of_case deftype = Atom "FUNC");
  let arrow = deftype |> nth_arg_of_case 0 in
  let f i = nth_arg_of_case i arrow in
  f 0, f 1

let bt_to_arrow bt =
  match destruct_case bt with
  | "_RESULT", [{it = OptE (Some v); _}] -> [], [v]
  | "_RESULT", _ -> [], []
  | "_IDX", [tid] ->
    let rt1, rt2 = tid |> get_deftype |> deftype_to_arrow in
    let f rt = nth_arg_of_case 0 rt |> exp_to_list in
    f rt1, f rt2
  | _ -> failwith @@ spf "Cannot convert bt(`%s`) to arrow" (string_of_exp bt)

let extract_gt = nth_arg_of_case 0
let extract_tt = nth_arg_of_case 0
let extract_mt = nth_arg_of_case 0
let extract_jt tag = nth_arg_of_case 0 tag |> get_deftype
let extract_et = nth_arg_of_case 0

(* HARDCODE: This is a manual modeling of how validation context C is constructed *)
(* TODO: automate this? *)
let choose_type_from_context_field field pred =
  match field with
  | "TYPES" ->
    choosei_candidate pred !flattened_types_cache
  | "FUNCS" ->
    choosei_candidate (fun tid -> pred @@ get_deftype_int tid) !func_tids_cache
  | "GLOBALS" ->
    choosei_candidate (fun e -> pred @@ extract_gt e) !globals_cache
  | "TABLES" ->
    choosei_candidate (fun e -> pred @@ extract_tt e) !tables_cache
  | "MEMS" ->
    choosei_candidate (fun e -> pred @@ extract_mt e) !mems_cache
  | "TAGS" ->
    choosei_candidate (fun e -> pred @@ extract_jt e) !tags_cache
  | "ELEMS" ->
    choosei_candidate (fun e -> pred @@ extract_et e) !elems_cache
  | "DATAS" ->
    choosei_candidate (fun _ -> pred @@ nullary "OK" "datatype") !datas_cache
  | "LOCALS" ->
    let params = !param_cache |> Option.get |> nth_arg_of_case 0 |> exp_to_list |> List.map (fun x -> (true, x)) in
    let locals = !locals_cache |> List.map (apply_snd @@ nth_arg_of_case 0) in
    choosei_candidate (fun (set, t) -> pred @@ il_case "" "localtype" [nullary (if set then "SET" else "UNSET") "localtype"; t]) (params @ locals)
  | "LABELS" ->
    choosei_candidate (fun (_, _, t, _) -> pred @@ (il_list t (mk_VarT "resulttype") |> unary "" "resulttype")) !expr_info_stack
  | _ ->
    failwith @@ "TODO: choose_type_from_context_field " ^ field

(* HARDCODE: Enforce each comptype (FUNC, STRUCT, ARRAY) exists *)
let enforce_each_type types =
  assert (!version = 3);
  let comptypes = flatten_types types in

  let _, comptype = dispatch_deftyp "comptype" [] in
  let atoms =
    match comptype.it with
    | VariantT typcases ->
      typcases |> List.map (fun (mixop, _, _) -> atom_of_mixop mixop |> it)
    | _ -> []
  in

  let extra_func =
    if List.exists (fun t -> case_of_case t = Atom "FUNC") comptypes then
      []
    else if List.mem (Atom "FUNC") atoms then
      [parse_exp "TYPE (REC (SUB eps eps (FUNC (eps -> eps))))" "type"]
    else
      []
  in
  let extra_struct =
    if List.exists (fun t -> case_of_case t = Atom "STRUCT") comptypes then
      []
    else if List.mem (Atom "STRUCT") atoms then
      [parse_exp "TYPE (REC (SUB eps eps (STRUCT eps)))" "type"]
    else
      []
  in
  let extra_array =
    if List.exists (fun t -> case_of_case t = Atom "ARRAY") comptypes then
      []
    else if List.mem (Atom "ARRAY") atoms then
      [parse_exp "TYPE (REC (SUB eps eps (ARRAY (MUT I32))))" "type"]
    else
      []
  in

  extra_func
  @ extra_struct
  @ extra_array
  @ types

(* HARDCODE: Ensure that type is constant-able for global, table, and elem *)
let ensure_constantable name e =
  let mk_nullable e =
    match e.it with
    | CaseE ([[{it = Atom "REF"; _}]; []; []], {it = TupE [nul; heaptype]; _}) ->
      (match heaptype.it with
      | CaseE ([[{it = Atom ("ANY" | "EQ" | "I31" | "FUNC" | "ARRAY" | "STRUCT"); _}]], _) ->
        e
      |_ ->
        replace_caseE_arg [0] {nul with it = OptE (Some (nullary "NULL" "nul"))} e
      )
    | _ -> e
  in
  match name.it with
  | Atom "GLOBAL" | Atom "TABLE" | Atom "ELEM" -> transform_exp mk_nullable e
  | _ -> e

let rule_contains_false r =
  let prems = rule_to_prems r in
  contains_false prems


(* Helpers for Top Down Gen *)

let has_same_mixop e_opt tc =
  match e_opt, tc with
  | None, _ -> true
  | Some e, (mixop, _, _) ->
    match e.it with
    | CaseE (mixop', _) -> Xl.Mixop.eq mixop mixop'
    | _ -> true

let contains_atom atoms tc =
  match tc with
  | ([{it = Atom atom; _}] :: _, _, _) -> List.mem atom atoms
  | _ -> false

exception SyntaxError

let try_gen_from_prems c e =
  let prems = c.prems in

  let rec extract_eq_cond e e' =
    match e'.it with
    | BinE (`OrOp, `BoolT, e1, e2) ->
        (match extract_eq_cond e e1, extract_eq_cond e e2 with
        | Some es1, Some es2 -> Some (union ~eq:Il.Eq.eq_exp es1 es2)
        | _ -> None)
    | BinE (`AndOp, `BoolT, e1, e2) ->
        (match extract_eq_cond e e1, extract_eq_cond e e2 with
        | Some es1, Some es2 -> Some (intersect ~eq:Il.Eq.eq_exp es1 es2)
        | Some es, None -> Some es
        | None, Some es -> Some es
        | _ -> None)
    | CmpE (`EqOp, `BoolT, e1, e2) when Il.Eq.eq_exp e e1 -> Some [e2]
    | CmpE (`EqOp, `BoolT, e2, e1) when Il.Eq.eq_exp e e1 -> Some [e2]
    | _ -> None
  in

  let extract_eq_cond_prem e p =
    match p.it with
    | IfPr e' -> extract_eq_cond e e'
    | _ -> None
  in

  match e.it with
  | VarE id when id.it <> "_" ->
    (match List.find_map (extract_eq_cond_prem e) prems with
    | None -> c.refer
    | Some es ->
      match c.refer with
      | None -> Some (choose es)
      | Some r ->
        match List.find_opt (fun e -> Il.Eq.eq_exp e r) es with
        | None -> Some (choose es)
        | some -> some
    )
  | IterE (e', (List, [x, _]))  ->
    let e_l = LenE e |> to_phrase (NumT `NatT $ no_region) in
    (match List.find_map (extract_eq_cond_prem e_l) prems with
      | Some e_ns ->
        let e_n = choose e_ns in
        (* TODO?: This overwrites c.refer *)
        let n = exp_to_int e_n in
        let es = List.init n (fun i ->
          transform_exp (replace_id x.it (x.it ^ "." ^ string_of_int i)) e'
        ) in
        Some {e with it = ListE es}
      | None -> c.refer
    )
  (* HARDCODE: this fixes spec error. Remove this when spec error is fixed. *)
  | IterE ({it = VarE {it = "half__"; _}; _}, (Opt, [_, _]))
    when c.parent_case.it = Atom "VCVTOP" && case_of_case @@ List.hd c.prev_case_args = Atom "EXTEND" ->
    Some (
      OptE (Some (
        il_var "half" (mk_VarT "half__")
      )) |> to_phrase e.note
    )
  | IterE ({it = VarE {it = "half__"; _}; _}, (Opt, [_, _]))
    when c.parent_case.it = Atom "VCVTOP"
    && case_of_case @@ List.hd c.prev_case_args = Atom "CONVERT"
    && (List.nth c.prev_case_args 2) |> nth_arg_of_case 0 |> case_of_case = Atom "F64" ->
    Some (
      OptE (Some (
        il_var "half" (mk_VarT "half__")
      )) |> to_phrase e.note
    )
  | IterE ({it = VarE {it = "zero__"; _}; _}, (Opt, [_, _]))
    when c.parent_case.it = Atom "VCVTOP" && case_of_case @@ List.nth c.prev_case_args 1 = Atom "DEMOTE" ->
    Some (
      OptE (Some (
        il_var "zero" (mk_VarT "zero__")
      )) |> to_phrase e.note
    )
  | IterE ({it = VarE {it = "zero__"; _}; _}, (Opt, [_, _]))
    when c.parent_case.it = Atom "VCVTOP"
    && List.mem (case_of_case @@ List.nth c.prev_case_args 1) [Atom "TRUNC_SAT"; Atom "RELAXED_TRUNC"]
    && (List.nth c.prev_case_args 2) |> nth_arg_of_case 0 |> case_of_case = Atom "F64" ->
    Some (
      OptE (Some (
        il_var "zero" (mk_VarT "zero__")
      )) |> to_phrase e.note
    )
  | _ -> c.refer

let reverse = false

let rec gen c x =
  Debug_log.(log "top_down.gen" (fun _ -> x) string_of_exp) @@ fun _ ->
  (* HARDCODE: Generate wasm expression with the given output type.
     This may be automated, by looking at the use of rule Expr_ok and Expr_ok_const *)
  if x = "expr" then
    let output_type =
      match c.parent_case.it with
      | Atom "FUNC" ->
        let (param, return) = List.nth c.prev_case_args 1 |> get_deftype |> deftype_to_arrow in
        param_cache := Some param;
        return_cache := Some return;
        return |> nth_arg_of_case 0 |> exp_to_list
      | Atom "GLOBAL" -> [List.hd c.prev_case_args |> nth_arg_of_case 1] (* globaltype *)
      | Atom "TABLE" -> [List.hd c.prev_case_args |> nth_arg_of_case 2] (* tabletype *)
      | Atom "ELEM" -> [List.hd c.prev_case_args]
      | Atom "ACTIVE" ->
        let idx = List.hd c.prev_case_args |> nth_arg_of_case 0 |> exp_to_int in
        (match c.parent_name with
        | "elemmode" -> [List.nth !tables_cache idx |> nth_arg_of_case 0 |> nth_arg_of_case 0] (* From table *)
        | "datamode" -> [List.nth !mems_cache idx |> nth_arg_of_case 0 |> nth_arg_of_case 0] (* From memory *)
        | _ -> failwith "Trying to generate wasm_expr under an unknown context"
        )
      | _ -> failwith "Trying to generate wasm_expr under an unknown context"
    in
    gen_wasm_expr c [] output_type output_type
  else if x = "instr" then
    gen_wasm_instr c
  (* TODO: Generalize this *)
  else if x = "typeidx" && c.refer = None then
    let tid = Random.int @@ List.length !flattened_types_cache in
    parse_exp (string_of_int tid) "typeidx"
  else

  let c = { c with parent_name = x } in

  let a2e a =
    match a.it with
    | ExpA e -> reduce_exp e
    | _ -> failwith @@ "Unsupported arg for " ^ x
  in
  let args = List.map a2e c.args in
  let params, deftyp = dispatch_deftyp x args in
  let params = List.map a2e params in
  let map = List.fold_left2 unify_exp [] args params in
  let replace_params = (fun e ->
    List.fold_left (fun e (x, e') ->
      replace_id_with x e' e
    ) e map
  ) in
  (match deftyp.it with
  | AliasT typ -> gen_typ c (transform_typ replace_params typ)
  | StructT typfields ->
    let ref_fields =
      match c.refer with
      | Some ({it = StrE fs; _}) -> List.map (fun (_atom, e) -> Some e) fs
      | _ -> List.init (List.length typfields) (fun _ -> None)
    in
    let gen_typfield (atom, (_binds, typ, _prems), _hints) refer =
      atom, gen_typ {c with refer} (transform_typ replace_params typ)
    in
    StrE (List.map2 gen_typfield typfields ref_fields) |> to_phrase c.typ (* TODO: The order of fields may be different *)
  | VariantT typcases ->
    let typcases = typcases
      |> Lib.List.filter_not (has_subid_hint "sem")
      |> Lib.List.filter_not (has_subid_hint "admin")
      |> List.filter (has_same_mixop c.refer)
    in
    if typcases = [] then (failwith @@ "Could not select appropriate typecase for " ^ x) else
    try_n 100 ("Generating typecase for " ^ x) @@ fun () ->
      let typcase = Utils.choose typcases in
      let typcase' =
        let (m, (bs, t, ps), hs) = typcase in
        let t' = transform_typ replace_params t in
        let ps' = List.map (transform_prem replace_params) ps in
        let ps' = List.concat_map reduce_prem ps' in
        if contains_false ps' then raise SyntaxError;
        m, (bs, t', ps'), hs
      in
      let case = gen_typcase c typcase' in
      if validate_case x case then
        Some case
      else
        None
  )

(* HARDCODE: Wasm expression *)
and gen_wasm_expr c rt1 rt2 label =
  try_n 100 "Generating wasm expression"
  ~on_fail:
  (fun () ->
    Log.debug @@
      "Out Of Life while generating expr with type "
      ^ string_of_rt rt1
      ^ " -> "
      ^ string_of_rt rt2;
    force_stack_type rt1 rt2
  )
  (fun () ->
    let const_required = List.mem c.parent_case.it !Utils.const_ctxs in
    let refs =
      match c.refer with
      | Some {it = ListE l; _} -> l |> List.map (fun e -> Some e)
      | _ ->
        let n = Random.int (if const_required then 3 else 5) + 1 (* 1, 2, 3, (4, 5) *) in
        List.init n (fun _i -> None)
    in
    let n = List.length refs in
    (* TODO: make input optional? *)
    push (List.rev rt1, List.rev rt2, label, n) expr_info_stack;
    let prev_locals = !locals_cache in
    try
      let l = List.map (fun refer -> gen {c with refer} "instr") refs in
      let (vts1, vts2, _, _) = top expr_info_stack in
      let l = l @ force_stack_type (List.rev vts1) (List.rev vts2) in
      let l = if reverse then List.rev l else l in (* Construct in reverse order *)
      pop expr_info_stack;
      Some l
    with _ ->
      pop expr_info_stack;
      locals_cache := prev_locals;
      None
  ) |> (fun l -> ListE l |> to_phrase (mk_VarT "expr"))

(* HARDCODE: Wasm instruction *)
and gen_wasm_instr c =
  (* Filters for preventing certain wasm instructions to be generated *)
  (* HARDCODE: checks if currently in a context that requires const instrution *)
  let const_required = List.mem c.parent_case.it !Utils.const_ctxs in
  let get_winstr_name mixop = string_of_atom (mixop |> List.hd |> List.hd) in
  let refer_filter = has_same_mixop c.refer in
  let const_filter (mixop, _, _) = const_required --> List.mem (get_winstr_name mixop) !Utils.consts in
  let block_filter (mixop, _, _) =
    (c.depth_limit <= 0) --> not (List.mem (get_winstr_name mixop) [ "BLOCK"; "LOOP"; "IF"; "TRY_TABLE" ])
  in
  let admin_filter = Fun.negate (has_subid_hint "admin") in
  (* HARDCODE: approximate which two types are definitely not-subtypable *)
  let rec unmatchable' stack ts =
    match stack, ts with
    | _, [] -> false
    | [], _ -> true
    | hd1 :: tl1, hd2 :: tl2 ->
      (match hd1.it, hd2.it with
      | CaseE (mixop1, _), CaseE (mixop2, _) -> not @@ Xl.Mixop.eq mixop1 mixop2
      | _ -> false
      )
      || unmatchable' tl1 tl2
  in
  let unmatchable stack rt =
    match rt.it with
    | ListE ts -> unmatchable' stack (List.rev ts)
    | _ -> false
  in
  (* Filter-out defenitely-impossible instructions *)
  let poppable_filter (mixop, _, _) =
    let stack = expr_info_stack |> top |> (fun (x, _, _, _) -> x) in
    let case = get_winstr_name mixop in
    let trules = find_trules case in
    let rt1s, _ = trules |> List.map rule_to_arrow |> List.split in
    List.exists (Fun.negate @@ unmatchable stack) rt1s
  in
  let pushable_filter (mixop, _, _) =
    let target_stack = expr_info_stack |> top |> (fun (_, x, _, _) -> x) in
    let case = get_winstr_name mixop in
    let trules = find_trules case in
    let _, rt2s = trules |> List.map rule_to_arrow |> List.split in
    List.exists (Fun.negate @@ unmatchable target_stack) rt2s
  in
  (* End of filters *)
  let typcases =
    match dispatch_deftyp "instr" [] with
    | _, {it = VariantT typcases; _} ->
      typcases
      |> List.filter refer_filter
      |> List.filter const_filter
      |> List.filter block_filter
      |> List.filter admin_filter
      |> List.filter (if reverse then pushable_filter else poppable_filter)
    | _ -> failwith "`syntax instr` must be variant type"
  in

  (* Dynamic filter *)
  let impossible_cases = ref [] in
  let catch = function
    | ImpossibleCase case -> push case impossible_cases; None
    | e -> trace_exc "Generate Wasm instruction" e
  in
  let impossible_filter (mixop, _, _) =
    not @@ List.mem (Atom (get_winstr_name mixop)) !impossible_cases
  in
  try_n 100 "Generate wasm instruction" ~catch @@ fun () ->
    let typcases = typcases |> List.filter impossible_filter in
    if typcases = [] then failwith "Suitable instruction does not exist";
    let mixop, (_, typs, prems), _ = choose typcases in
    let c' = { c with
      prems;
      parent_name = "instr";
      parent_case = atom_of_mixop mixop;
      depth_limit = c.depth_limit - 1
    } in
    let case = get_winstr_name mixop in
    let trule = find_trules case |> choose in
    (*
    print_endline "=======";
    print_endline case;
    print_endline @@ string_of_rule trule;
    *)
    let trule' = fix_rts c' trule in
    let rt1, rt2 = rule_to_arrow trule' in
    let rt1, rt2 = exp_to_list rt1, exp_to_list rt2 in
    let valid_rts =
      (if reverse then pushable rt2 else poppable rt1) && (
        let cur_stack, target_stack, _, n = (if reverse then r_updated_stack else updated_stack) rt1 rt2 (List.hd !expr_info_stack) in
        let d = edit_dist cur_stack target_stack in
        (* Check if Random.float <= n^2 + 2 / (n^2+d), but in smarter way *)
        d = 0 || (Random.int (n*n + d) < n*n + (if const_required || reverse then 0 else 2))
      )
    in
    if not valid_rts then None else
    let instr = rule_to_instr trule' in
    let args =
      match instr.it with
      | CaseE (_, args) -> args
      | _ -> failwith @@ "instr " ^ string_of_exp instr ^ "is not CaseE"
    in
    let refer = Some args in
    let args' = gen_typs {c' with refer} typs in

    (* Final validation *)
    let* s = match_exp (il_tup args') args Il.Subst.empty in
    let trule'' = subst_rule s trule' in
    if rule_contains_false trule'' then
      None
    else (
      (* New instr is confirmed *)
      update_local_idx trule'';
      (if reverse then r_update_rt else update_rt) rt1 rt2;
      Some (il_case case "instr" args')
    )

and gen_typcase c (mixop, (_binds, typs, prems), _hints) =
  let refer = Option.bind c.refer (fun e ->
    match e.it with CaseE (_, args) -> Some args
    | _ -> None
  ) in
  let atom = try atom_of_mixop mixop with | _ -> atomize (Atom "") in
  let es =
    let c' = {c with prems; parent_case = atom; refer} in
    gen_typs c' typs
    |> List.map (gen_if_wasm_funcs c') (* HARDCODE: deferred func. *)
  in
  CaseE (mixop, il_tup es) |> to_phrase c.typ
and gen_if_wasm_funcs c e =
  match e.it with
  | CaseE ([[{it = Atom "DEFERRED_FUNCS"; _}]], _) ->
    let typ = mk_VarT "func" in
    let my_func_tids = !func_tids_cache |> List.filteri (fun i _ -> i >= !imported_funcs_len) in
    let l = List.map (fun tid ->
      let refer = Some (il_case "FUNC" "func" [unary "" "typeidx" (il_nat tid); wildcard; wildcard]) in
      gen { c with typ; refer } "func"
    ) my_func_tids in
    il_list l typ
  | _ -> e
and gen_typs c typs =
  match typs.it with
  | TupT typs' ->
    let refs =
      match c.refer with
      | Some {it = TupE es; _} -> List.map Option.some es
      | _ -> List.init (List.length typs') (fun _ -> None)
    in
    List.fold_left_map (fun (replaces, prems) ((e, t), refer) ->
      let e', prems' =
        let prev_case_args = replaces |> List.split |> snd in
        let c = {c with prems; refer; prev_case_args} in
        let refer = try_gen_from_prems {c with refer} e in
        let c = {c with refer} in

        let t' = List.fold_left (fun t (e, e') -> transform_typ (replace e e') t) t replaces in

        try_n 10 ("Generating syntax for " ^ string_of_typ t') (fun () ->
          let e' = gen_typ c t' in

          (* HARDCODE: Ensure that type is constant-able *)
          let e' = ensure_constantable c.parent_case e' in

          let prems' = List.map (transform_prem (replace e e')) prems in
          (e', prems') |> unless (prems' |> contains_false)
        )
      in
      ((e, e') :: replaces, prems'),
      e'
    ) ([], c.prems) (List.combine typs' refs) |> snd
  | _ -> [ gen_typ c typs ]
and gen_typ c typ =
  let refer = c.refer in
  let c = { c with refer = None } in
  match typ.it with
  | VarT (id, [{it = TypA t; _}]) when id.it = "list" -> (* HARDCODE: list *)
    (match refer with
    | Some {it = CaseE ([[]; []], {it = TupE [el]; _}); _} ->
      CaseE ([[]; []], il_tup [gen_typ {c with refer = Some el} (IterT (t, List) $ no_region)])
        |> to_phrase typ
    | _ ->
      CaseE ([[]; []], il_tup [gen_typ c (IterT (t, List) $ no_region)])
        |> to_phrase typ
    )
  | VarT (id, args) -> gen {c with typ; args; prems = []; refer} id.it
  | NumT `NatT ->
    (match refer with
    | Some ({it = NumE (`Nat _); _} as r) -> r
    | _ -> NumE (`Nat (Random.int 3 |> Z.of_int)) |> to_phrase typ (* 0, 1, 2 *)
    )
  | NumT `IntT ->
    (match refer with
    | Some ({it = NumE (`Int _); _} as r) -> r
    | _ -> NumE (`Int (Random.int 5 - 2 |> Z.of_int)) |> to_phrase typ (* -2 ~ 2 *)
    )
  | IterT (typ', List) ->
    (match refer with
    | Some {it = ListE rs; _} ->
      ListE (List.map (fun r -> gen_typ {c with refer = Some r} typ') rs) |> to_phrase typ
    | _ ->
      let name = match typ'.it with VarT (id, _) -> id.it | _ -> "" in
      let len =
        match extract_length_cond c.parent_name name with
        | Some l -> Random.int (l+1)
        | _ ->
        match name with
        | "table" | "data" | "elem" | "global" | "mem" | "local" | "tag" -> Random.int 3 (* 0, 1, 2 *)
        | "func" | "type" -> Random.int 3 + 3 (* 3, 4, 5 *)
        | "typeuse" -> 0 (* HARDCODE: disable subtype for now, TODO: Enable it again *)
        | _ -> Random.int 3 (* 0, 1, 2 *)
      in
      (* HARDCODE: Defer generating functions *)
      if name = "func" then (
        imported_funcs_len := List.length !func_tids_cache;
        append_cache func_tids_cache (
          match !version with
          | 2 -> List.init len (fun _ -> Random.int (List.length !types_cache));
          | 3 -> List.init len (fun _ -> choose_func_type_idx !flattened_types_cache);
          | _ -> failwith "Unsupported version"
        );
        il_case "DEFERRED_FUNCS" "deferred_funcs" []
      )
      (* HARDCODE: instrs *)
      else if name = "instr" then (
        let bt = Lib.List.last c.prev_case_args in
        let rt1, rt2 = bt_to_arrow bt in
        let label = if c.parent_case.it = Atom "LOOP" then rt1 else rt2 in
        gen_wasm_expr c rt1 rt2 label
      )
      (* HARDCODE: Import all tables, globals, tables, mems *)
      else if name = "import" then
        let mk_import case c type_name extractor i e =
          assert (i < 10);
          parse_exp (spf "IMPORT (77 48) (%d %d) (%s %s)" (Char.code c) (48 + i) case type_name) "import"
          |> transform_exp (replace_id_with type_name (extractor e))
        in
        let mk_idx n = unary "_IDX" "typeuse" n in
        let l =
          List.mapi (mk_import "FUNC" 'f' "typeuse" mk_idx) (!func_tids_cache |> List.map il_nat)
          @ List.mapi (mk_import "GLOBAL" 'g' "globaltype" extract_gt) !globals_cache
          @ List.mapi (mk_import "TABLE" 't' "tabletype" extract_tt) !tables_cache
          @ List.mapi (mk_import "MEM" 'm' "memtype" extract_mt) !mems_cache
          @ List.mapi (mk_import "TAG" 'j' "typeuse" (nth_arg_of_case 0 @> mk_idx)) !tags_cache
        in
        ListE l |> to_phrase typ
      (* HARDCODE: Export all stuffs *)
      else if name = "export" then
        let mk_export case c i =
          assert (i < 10);
          parse_exp (spf "EXPORT (%d %d) (%s %d)" (Char.code c) (48 + i) case i) "export"
        in
        let rec drop n xs =
          match n, xs with
          | 0, _ -> xs
          | _, [] -> []
          | _, _ :: tl -> drop (n-1) tl
        in
        let l =
          (List.init (List.length !func_tids_cache) (mk_export "FUNC" 'f') |> drop !imported_funcs_len)
          @ List.init (List.length !globals_cache) (mk_export "GLOBAL" 'g')
          @ List.init (List.length !tables_cache) (mk_export "TABLE" 't')
          @ List.init (List.length !mems_cache) (mk_export "MEM" 'm')
          @ List.init (List.length !tags_cache) (mk_export "TAG" 'j')
        in
        ListE l |> to_phrase typ
      else
        let l = List.init len (fun _i -> gen_typ c typ') in
        (* HARDCODE: Ensure that there is at least one func type *)
        let l = if name = "type" && !version = 3 then enforce_each_type l else l in
        (* HARDCODE: Reuse all types defined in previous module *)
        let l = if name = "type" then !types_cache @ l else l in
        (* HARDCODE: Store these module infos into chache *)
        if name = "type" then (
            types_cache := l;
            if !version = 3 then
              (flattened_types_cache := flatten_types l; deftypes_cache := roll l)
            else
              flattened_types_cache := l;
        );
        if name = "elem" then elems_cache := l;
        if name = "data" then datas_cache := l;
        (* HARDCODE: these entries are imported *)
        if name = "global" then append_cache globals_cache l;
        if name = "table" then append_cache tables_cache l;
        if name = "mem" then append_cache mems_cache l;
        if name = "tag" then append_cache tags_cache l;
        if name = "local" then locals_cache := (List.map (fun x -> (false, x))) l; (* TODO: handle DEFAULTABLE *)
        ListE l |> to_phrase typ
    )
  | IterT (typ', Opt) ->
    (match refer with
    | Some ({it = OptE None; _} as r) -> r
    | Some ({it = OptE (Some r); _}) -> OptE (Some (gen_typ {c with refer = Some r} typ')) |> to_phrase typ
    | _ ->
      if Random.bool() then
        OptE None |> to_phrase typ
      else
        OptE (Some (gen_typ c typ')) |> to_phrase typ
    )
  | TupT ets ->
    (match refer with
    | Some {it = TupE rs; _} ->
      TupE (List.map2 (fun (_, t) r -> gen_typ {c with refer = Some r} t) ets rs) |> to_phrase typ
    | _ ->
      TupE (ets |> List.map (fun (_, t) -> gen_typ c t)) |> to_phrase typ
    )
  | _ -> failwith ("TODO: unhandled type for gen_typ: " ^ string_of_typ typ)

and fix_rts c trule =
  let open Il.Subst in

  (* HARDCODE: Preprocess for BR_TABLE *)
  let preprocess trule =
    let prems = rule_to_prems trule in
    let extract_iter_var p =
      match p.it with
      | IterPr ({it = RulePr ({it = "Resulttype_sub"; _}, _, _); _}, (List, [_x, e])) -> Some e
      | _ -> None
    in
    match List.find_map extract_iter_var prems with
    | None -> trule
    | Some e ->
      match e.it, e.note.it with
      | VarE x, IterT (t, _) ->
        let es = List.init (Random.int 3) (fun i ->
          il_var (x.it ^ "[" ^ string_of_int i ^ "]") t
        ) in
        let s = add_varid empty x (il_list es t) in
        subst_rule s trule
      | _ -> trule
  in

  (* HARDCODE: handle specific set of prems *)
  let update_subst_for_context_prem s p =
    let* s0 = s in

    let p = subst_prem s0 p in

    match p.it with
    (* -- if C.fields[i] = t *)
    | IfPr {it = CmpE (
        `EqOp, `BoolT,
        {it = IdxE ({it = DotE (_C, {it = Atom field; _}); _}, i); _},
        t
      ); _}
    | IfPr {it = CmpE (
        `EqOp, `BoolT,
        t,
        {it = IdxE ({it = DotE (_C, {it = Atom field; _}); _}, i); _}
      ); _}
    (* -- Expand: C.fields[i] ~~ t *)
    | RulePr ({it = "Expand"; _}, [[]; _; []], {it = TupE [
        { it = IdxE ({ it = DotE (_C, {it = Atom field; _}); _ }, i); _ };
        t
      ]; _})
    | RulePr ({it = "Expand"; _}, [[]; _; []], {it = TupE [
        t;
        { it = IdxE ({ it = DotE (_C, {it = Atom field; _}); _ }, i); _ }
      ]; _})
    (* -- Reftype_sub: C |- C.fileds[i] <: t *)
    (* TODO: Consider subtype *)
    | RulePr ({it = "Reftype_sub"; _}, [[]; _; _; []], {it = TupE [
        _;
        { it = IdxE ({ it = DotE (_C, {it = Atom field; _}); _ }, i); _ };
        t
      ]; _})
    ->
      let pred e = match_exp e t s0 in
      let index, s1 = choose_type_from_context_field field pred in
      let* s2 = match_exp (il_nat index) i s1 in
      Some s2
    (* -- if C.fields[i]!'%'.0 = t *)
    | IfPr {it = CmpE (
        `EqOp, `BoolT,
        {it = ProjE ({it = UncaseE ({it = IdxE ({it = DotE (_C, {it = Atom field; _}); _}, i); _}, [[];[]]); _}, 0); _},
        t
      ); _}
    | IfPr {it = CmpE (
        `EqOp, `BoolT,
        t,
        {it = ProjE ({it = UncaseE ({it = IdxE ({it = DotE (_C, {it = Atom field; _}); _}, i); _}, [[];[]]); _}, 0); _}
      ); _}
    ->
      let pred e = match_exp (nth_arg_of_case 0 e) t s0 in
      let index, s1 = choose_type_from_context_field field pred in
      let* s2 = match_exp (il_nat index) i s1 in
      Some s2
    (* -- Resulttype_sub: C |- t* <: C.field[l] *)
    | RulePr ({it = "Resulttype_sub"; _}, [[]; _; _; []], {it = TupE [
        _C';
        t;
        {it = ProjE ({it = UncaseE ({it = IdxE ({it = DotE (_C, {it = Atom field; _}); _}, i); _}, [[];[]]); _}, 0); _}
      ]; _})
    ->
      let pred e = match_exp e (il_case "" "resulttype" [t]) s0 in
      let index, s1 = choose_type_from_context_field field pred in
      let* s2 = match_exp (il_nat index) i s1 in
      Some s2
    | IterPr ({it = RulePr ({it = "Valtype_sub"; _}, _, _); _}, (List, [
        _, t;
        _, {it = ProjE ({it = UncaseE ({it = IdxE ({it = DotE (_C, {it = Atom field; _}); _}, i); _}, [[];[]]); _}, 0); _}
      ]))
    ->
      let pred e = match_exp e (il_case "" "resulttype" [t]) s0 in
      let index, s1 = choose_type_from_context_field field pred in
      let* s2 = match_exp (il_nat index) i s1 in
      Some s2
    (* -- if x <- C.REFS *)
    | IfPr {it = MemE (
        x,
        {it = DotE (_C, {it = Atom "REFS"; _}); _}
      ); _}
    ->
      let refs = get_refs_cache () in
      let ref = choose refs in (* TODO: be smarter when x is known *)
      match_exp ref x s0
    (* -- if C.RETURN = rt *)
    | IfPr {it = CmpE (
        `EqOp, `BoolT,
        {it = DotE (_C, {it = Atom "RETURN"; _}); _},
        {it = OptE (Some t); _}
      ); _}
    ->
      let* return = !return_cache in
      match_exp return t s0
    (* -- Blocktype: C |- bt : t *)
    | RulePr ({it = "Blocktype_ok"; _}, [[]; _; _; []], {it = TupE [
        _C;
        bt;
        t
      ]; _})
    ->
      let blocktype, ty =
        match Random.int 5 with
        | 0 ->
          parse_exp "_RESULT eps" "blocktype",
          parse_exp "eps -> eps" "instrtype"
        | 1 ->
          let vt = gen_typ {c with refer = None} (mk_VarT "valtype") in
          parse_exp "_RESULT valtype" "blocktype"
            |> transform_exp (replace_id_with "valtype" vt),
          parse_exp "eps -> valtype" "instrtype"
            |> transform_exp (replace_id_with "valtype" vt)
        | _ ->
          let pred e =
            try if case_of_case e = Atom "FUNC" then
              let arrow = nth_arg_of_case 0 e in
              Some (arrow |> nth_arg_of_case 0, arrow |> nth_arg_of_case 1)
            else None
            with _ -> None
          in
          let index, (rt1, rt2) = choose_type_from_context_field "TYPES" pred in
          parse_exp ("_IDX " ^ string_of_int index) "blocktype",
          parse_exp "rt1 -> rt2" "instrtype"
            |> transform_exp (replace_id_with "rt1" rt1)
            |> transform_exp (replace_id_with "rt2" rt2)
      in
      let* s1 = match_exp ty t s0 in
      let* s2 = match_exp blocktype bt s1 in
      Some s2
    | _ -> Some s0
  in

  let catch e =
    match e with
    | EmptyChoosei -> raise @@ ImpossibleCase c.parent_case.it (* Retrying is meaninsless *)
    | _ -> prerr_endline @@ Printexc.to_string e; None
  in
  let on_fail () = raise @@ ImpossibleCase c.parent_case.it in
  try_n 100 ("Fixing rts of " ^ Xl.Atom.to_string c.parent_case) ~catch ~on_fail @@ fun () ->

  (* 0. HARDCDOE: Preprocess *)
  let trule = preprocess trule in

  (* 1. Concretize all C.FIELD[idx] = e *)
  let prems = rule_to_prems trule in
  let* s = List.fold_left update_subst_for_context_prem (Some empty) prems in
  let trule = subst_rule s trule in
  if rule_contains_false trule then None else

  (* 2. Concretize length of IterE *)
  let rt1, rt2 = rule_to_arrow trule in
  let is_iter e =
    match e.it with
    | IterE ({it = VarE x; _}, (List, [x', {it = VarE _; _}])) -> Il.Eq.eq_id x x'
    | IterE (_, (ListN ({it = VarE _; _}, None), [])) -> true
    | _ -> false
  in
  let iters = List.concat_map (collect_exp is_iter) [rt1; rt2] |> dedup Il.Eq.eq_exp in
  let s = List.fold_left (fun s e ->
    match e.it, e.note.it with
    | IterE (_, (List, [x, {it = VarE x'; _}])), IterT (t, _) ->
      let es = List.init (Random.int 3) (fun i ->
        il_var (x.it ^ "*[" ^ string_of_int i ^ "]") t
      ) in
      add_varid s x' (il_list es t)
    | IterE (_, (ListN ({it = VarE n; _}, None), [])), _ ->
      add_varid s n (il_nat (Random.int 3))
    | _ -> assert false
  ) empty iters in

  let trule = subst_rule s trule in
  if rule_contains_false trule then None else

  (* 3. Concretize all entangled variables in rt *)
  (* TODO: Remove this step, and do the natural merging of types? *)
  let rt1, rt2 = rule_to_arrow trule in
  let is_var e = match e.it with | VarE _ -> true | _ -> false in
  let vars = List.concat_map (collect_exp is_var) [rt1; rt2] |> dedup Il.Eq.eq_exp in
  let is_my_var e = List.exists (Il.Eq.eq_exp e) vars in
  (* HARDCODE: Remove Instrtype_ok premise *)
  let instrtype_ok_to_true p =
    match p.it with
    | RulePr ({it="Instrtype_ok"; _}, _, _) -> {p with it = IfPr il_true}
    | _ -> p
  in
  let trule' = Il2al.Il_walk.(transform_rule {base_transformer with transform_prem = instrtype_ok_to_true} trule) in
  let freq = collect_exp_rule is_my_var trule' |> count_freq Il.Eq.eq_exp in

  let s = List.fold_left (fun s (e, i) ->
    if i = 1 then s else (* This variable is not restircted at all *)
    match e.it with
    | VarE x ->
      add_varid s x (gen_typ {c with refer = None} e.note)
    | _ -> assert false
  ) empty freq in

  let trule = subst_rule s trule in
  if rule_contains_false trule then None else Some trule

let gen_typ typ = gen_typ default_context typ

(* HARDCODE: If premise is x = y, then just identify them (i.e. for EXTERN.CONVERT_ANY) *)
let handle_trivial_equality r =
  let rec is_simple_var e =
    match e.it with
    | VarE _ -> true
    | IterE (e, (_, [_, {it = VarE _; _}])) -> is_simple_var e
    | _ -> false
  in
  let is_trivial_equality prem =
    match prem.it with
    | IfPr ({it = CmpE (`EqOp, `BoolT, l, r); _})
        when is_simple_var l && is_simple_var r ->
      Some (l, r)
    (* TODO: Do not condiser subtype as equality *)
    | RulePr (id, _, {it = TupE [_C; l; r]; _})
        when String.ends_with ~suffix:"_sub" id.it && is_simple_var l && is_simple_var r ->
      Some (l, r)
    | _ -> None
  in

  let prems = rule_to_prems r in
  let eqs = List.filter_map is_trivial_equality prems in
  let f e = List.fold_left (fun e (e1, e2) -> replace e1 e2 e) e eqs in
  transform_rule f r

(* Main entry *)
let gen_modules n =
  (* Init *)
  init_cache ();
  trules := get_typing_rules () |> List.map handle_trivial_equality;

  (* IL Module *)
  let modules = List.init n (fun _ -> gen_typ (mk_VarT "module")) in

  (* IL2AL *)
  let al_modules = List.map (fun m -> m |> il2al |> exp2val) modules in

  List.iter (fun al_module -> Al.Print.string_of_value al_module |> Log.debug) al_modules;

  al_modules
