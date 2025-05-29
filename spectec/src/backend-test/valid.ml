open Utils

open Il.Ast

open Util
open Source

type cache = exp list ref
let types_cache : cache = ref []
let flattened_types_cache : cache = ref []
let deftypes_cache : cache = ref []
let locals_cache : (bool * exp) list ref = ref []
let func_tids_cache : int list ref = ref []
let imported_funcs_len = ref 0
let globals_cache : cache = ref []
let tables_cache : cache = ref []
let mems_cache : cache = ref []
let tags_cache : cache = ref []
let elems_cache : cache = ref []
let datas_cache : cache = ref []
let refs_cache : exp list option ref = ref None
let param_cache : exp option ref = ref None
let return_cache : exp option ref = ref None

let init_cache () =
  types_cache := [];
  flattened_types_cache := [];
  deftypes_cache := [];
  locals_cache := [];
  func_tids_cache := [];
  imported_funcs_len := 0;
  globals_cache := [];
  tables_cache := [];
  mems_cache := [];
  tags_cache := [];
  elems_cache := [];
  datas_cache := [];
  refs_cache := None;
  param_cache := None;
  return_cache := None;
  ()

let do_cache ref v = ref := v; v
let prepend_cache ref v = ref := v :: !ref; v
let append_cache ref vs = ref := !ref @ vs
let cache_if cond ref v = if cond then ref := v; v
let prepend_cache_if cond ref v = if cond then ref := v :: !ref; v

let flatten_types = List.concat_map (fun ty ->
  ty
  |> nth_arg_of_case 0
  |> nth_arg_of_case 0
  |> nth_arg_of_case 0
  |> exp_to_list
  |> List.map (nth_arg_of_case 2)
)

let choose_type_idx kind types =
  types
  |> List.mapi (fun i x -> i, x)
  |> List.filter (fun (_, x) -> case_of_case x = Atom kind)
  |> choose
  |> fst

let choose_func_type_idx = choose_type_idx "FUNC"
let choose_struct_type_idx = choose_type_idx "STRUCT"
let choose_array_type_idx = choose_type_idx "ARRAY"

let roll types =
  List.fold_left (fun acc typ ->
    (*
    let x = List.length acc in
    let call =
      parse_exps ("$rolldt(" ^ string_of_int x ^ ", rectype)") "deftype"
      |> transform_exp (replace_id_with "rectype" rectype)
    in
    let dts = call |> reduce_exp |> exp_to_list in
    *)
    let rectype = nth_arg_of_case 0 typ in
    let n = rectype |> nth_arg_of_case 0 |> nth_arg_of_case 0 |> exp_to_list |> List.length in
    let rectype' = rectype in (* TODO: this should be substituted *)
    let dts = List.init n (fun i -> il_case "DEF" "deftype" [rectype'; il_nat i]) in
    acc @ dts
  ) [] types

let get_refs_cache () =
  match !refs_cache with
  | Some cache -> cache
  | None ->
    let f = collect_exp (fun e -> match e.note.it with | VarT ({it = "funcidx"; _}, _) -> true | _ -> false) in
    let refs =
      List.concat_map f (!globals_cache @ !tables_cache @ !mems_cache @ !elems_cache @ !datas_cache)
      |> dedup Il.Eq.eq_exp
    in
    refs_cache := Some refs;
    refs

type valtype = Il.Ast.exp
type restype = valtype list

(* rt1, rt2, label, n *)
let expr_info_stack: (restype * restype * restype * int) list ref = ref []
let updated_stack rt1 rt2 (st, target, label, n) =
  let st1 = List.fold_right (fun _ st -> List.tl st) rt1 st in
  let st2 = List.fold_left  (fun st t -> t :: st) st1 rt2 in
  st2, target, label, n - 1
let update_rt rt1 rt2 =
  match !expr_info_stack with
  | [] -> failwith "expr_info_stack is empty"
  | hd :: tl -> expr_info_stack := updated_stack rt1 rt2 hd :: tl
let r_updated_stack rt1 rt2 (st, target, label, n) =
  let target1 = List.fold_right (fun _ target -> List.tl target) rt2 target in
  let target2 = List.fold_left  (fun target t -> t :: target) target1 rt1 in
  st, target2, label, n - 1
let r_update_rt rt1 rt2 =
  match !expr_info_stack with
  | [] -> failwith "expr_info_stack is empty"
  | hd :: tl -> expr_info_stack := r_updated_stack rt1 rt2 hd :: tl

let i32T = il_case "I32" "numtype" []
let i64T = il_case "I64" "numtype" []
let f32T = il_case "F32" "numtype" []
let f64T = il_case "F64" "numtype" []
let v128T = il_case "V128" "numtype" []

(* Helper *)
let string_of_vt = Il.Print.string_of_exp
let string_of_rt vts = List.map string_of_vt vts |> String.concat " "

let rec dec_align a n =
  if 1 lsl a <= n then a else
  dec_align (a-1) n

let is_inn nt = Il.Eq.eq_exp nt i32T || Il.Eq.eq_exp nt i64T
let is_fnn nt = Il.Eq.eq_exp nt f32T || Il.Eq.eq_exp nt f64T
let is_vnn nt = Il.Eq.eq_exp nt v128T
let is_ref rt = is_case rt && case_of_case rt = Atom "REF"
let is_nullable_ref rt = is_ref rt && (nth_arg_of_case 0 rt).it <> OptE None

let is_constructable_ref rt =
  is_ref rt &&
  let ht = (nth_arg_of_case 1 rt) in
  match case_of_case ht with
  | Atom ("ANY" | "EQ" | "I31" | "FUNC" | "ARRAY" | "STRUCT") -> true (* TODO: _IDX *)
  | _ -> false

(* TODO: this has same role with fix_value of botton_up generation*)
let rec default = function
| e when is_inn e -> [il_case "CONST" "instr" [e; il_zero]]
| e when is_fnn e -> [il_case "CONST" "instr" [e; il_fzero]]
| e when is_vnn e -> [il_case "VCONST" "instr" [e; il_zero]]
| e when is_nullable_ref e -> [il_case "REF.NULL" "instr" [nth_arg_of_case 1 e]]
| e when is_constructable_ref e -> default_ref e
(* TODO *)
| _ -> [il_case "UNREACHABLE" "instr" []]

and default_ref rt =
  let ht = (nth_arg_of_case 1 rt) in
  let case =
    match case_of_case ht with
    | Atom ("ANY" | "EQ") -> choose ["I31"; "STRUCT"; "ARRAY"]
    | Atom s -> s
    | _ -> failwith "unreachable default_ref"
  in
  match case with
  | "I31" -> default i32T @ [il_case "REF.I31" "isntr" []]
  | "STRUCT" ->
    let tid = parse_exp (choose_struct_type_idx !flattened_types_cache |> string_of_int) "typeidx" in
    [il_case "STRUCT.NEW_DEFAULT" "instr" [tid]]
  | "ARRAY" ->
    let tid = parse_exp (choose_array_type_idx  !flattened_types_cache |> string_of_int) "typeidx" in
    [il_case "ARRAY.NEW_FIXED" "instr" [tid; il_zero]]
  | "FUNC" ->
    let fid = parse_exp (Random.int (List.length !func_tids_cache) |> string_of_int) "typeidx" in
    [il_case "REF.FUNC" "instr" [fid]]
  | _ -> failwith "unreachable default_ref"

let try_match_one_of_arg arg rule =
  let RuleD (_id, _binds, _mixop, e, prems) = rule.it in
  let param = unwrap_tup e |> List.find @@ has_sametype arg in
  let* subst = match_exp arg param Il.Subst.empty in
  Some (subst, prems)

let rewrite_context prem =
  let rewrite_context_len' exp =
    match exp.it with
    | LenE ({it = DotE (_C, {it = Atom field; _}); _}) ->
      (match field with
      | "TYPES" -> List.length (if !Flag.version = 3 then !deftypes_cache else !types_cache) |> il_nat
      | "LOCALS" -> List.length !locals_cache |> il_nat
      | "FUNCS" -> List.length !func_tids_cache |> il_nat
      | "GLOBALS" -> List.length !globals_cache |> il_nat
      | "TABLES" -> List.length !tables_cache |> il_nat
      | "MEMS" -> List.length !mems_cache |> il_nat
      | "TAGS" -> List.length !tags_cache |> il_nat
      | "ELEMS" -> List.length !elems_cache |> il_nat
      | "DATAS" -> List.length !datas_cache |> il_nat
      | "LABELS" -> List.length !expr_info_stack |> il_nat
      | _ -> exp
      )
    | DotE (_C, {it = Atom "REFS"; _}) ->
      il_list (get_refs_cache ()) (mk_VarT "typeidx")
    | _ -> exp
  in
  let rewrite_context_access exp =
    match exp.it with
    | IdxE ({it = DotE (_C, {it = Atom field; _}); _}, idx) ->
      (match field, (reduce_exp idx).it with
      (* TODO: More cases *)
      | "LABELS", NumE (`Nat z) ->
        let i = Z.to_int z in
        if List.length !expr_info_stack > i then
          let (_, _, ts, _) = List.nth !expr_info_stack (Z.to_int z) in
          il_case "" "resulttpye" [(il_list ts (mk_VarT "valtype"))]
        else
          exp
      | _ -> exp
      )
    | _ -> exp
  in

  prem
  |> transform_prem rewrite_context_len'
  |> transform_prem rewrite_context_access

let handle_expand pr s =
  try (
    match pr.it with
    | RulePr ({it = "Expand"; _}, [[]; _; []], {it = TupE [
        { it = IdxE ({ it = DotE (_C, {it = Atom "TYPES"; _}); _ }, i); _ };
        t
      ]; _}) ->
      let lhs = List.nth (flatten_types !types_cache) (exp_to_int i) in
      match_exp lhs t s, true
    | RulePr ({it = "Expand"; _}, [[]; _; []], {it = TupE [
        { it = IdxE ({ it = DotE (_C, {it = Atom "FUNCS"; _}); _ }, i); _ };
        t
      ]; _}) ->
      let lhs = List.nth (flatten_types !types_cache) (exp_to_int i |> List.nth !func_tids_cache) in
      match_exp lhs t s, true
    | RulePr ({it = "Expand"; _}, [[]; _; []], {it = TupE [
        { it = IdxE ({ it = DotE (_C, {it = Atom "TAGS"; _}); _ }, i); _ };
        t
      ]; _}) ->
      let tid = i |> reduce_exp |> exp_to_int |> List.nth !tags_cache |> nth_arg_of_case 0 in
      let lhs = List.nth (flatten_types !types_cache) (tid |> nth_arg_of_case 0 |> exp_to_int) in
      match_exp lhs t s, true
    | _ -> (Some s, false)
  ) with _ -> (None, true)
let handle_expand prs =
  let (s, prs) = List.fold_left (fun (s, prs) pr ->
    match s with
    | None -> (None, [])
    | Some s ->
      let s', is_expand = handle_expand pr s in
      s',
      if is_expand then
        prs
      else
        prs @ [pr]
  ) (Some Il.Subst.empty, []) prs in

  match s with
  | None -> [IfPr il_false $ no_region]
  | Some s -> List.map (Il.Subst.subst_prem s) prs

let get_validation_rule x =
  let rel_id = String.capitalize_ascii x ^ "_ok" $ no_region in
  Il.Env.find_opt_rel !Langs.il_env rel_id

let validate_case x_t case =
  if x_t = "module" then true else

  match get_validation_rule x_t with
  | None -> true (* This case does not have corresponding validation rule -- always valid *)
  | Some (_mixop, _typ, rules) ->
    match List.filter_map (try_match_one_of_arg case) rules with
    | [s, prems] ->
      let prems = List.map (Il.Subst.subst_prem s) prems in
      let prems = List.map rewrite_context prems in
      let prems = handle_expand prems in (* Concretize free vairables *)
      let prems = List.concat_map reduce_prem prems in
      let prems = handle_expand prems in
      (*
      print_endline "=========";
      print_endline x_t;
      print_endline @@ Il.Print.string_of_exp case;
      List.iter (fun p -> print_endline @@ Il.Print.string_of_prem p) prems;
      *)
      not @@ contains_false prems;
    | _ -> (* TODO: handle more than 2 rules *)
      true

let extract_length_cond name typ =
  let* (_mixop, _typ, rules) = get_validation_rule name in
  let aux prem =
    match prem.it with
    | IfPr {it = CmpE (
        `LeOp, `NatT,
        {it = LenE {it = IterE ({it = VarE x; _}, _); _}; _},
        {it = NumE (`Nat z); _}
      ); _}
      when x.it = typ
    -> Some (Z.to_int z)
    | IfPr {it = CmpE (
        `LtOp, `NatT,
        {it = LenE {it = IterE ({it = VarE x; _}, _); _}; _},
        {it = NumE (`Nat z); _}
      ); _}
      when x.it = typ
    -> Some (Z.to_int z - 1)
    | _
    -> None
  in
  match rules with
  | [{it = RuleD (_id, _binds, _mixop, _e, prems); _}] ->
    prems |> List.find_map aux
  | _ -> None

let update_local_idx trule =
  let local_idx = rule_to_local_idx trule in
  if local_idx = [] then () else
  let params_len = !param_cache |> Option.get |> nth_arg_of_case 0 |> exp_to_list |> List.length in
  local_idx |> List.iter (fun x ->
    let i = x |> nth_arg_of_case 0 |> exp_to_int in
    if i >= params_len then
      locals_cache := List.mapi (fun i' (x, y) ->
        (if i' = (i - params_len) then true else x),
        y
      ) !locals_cache
  )
