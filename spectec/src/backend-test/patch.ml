open Al
open Ast
open Al_util
open Utils

let version = Backend_interpreter.Construct.version

let error msg v =
  v
  |> Print.string_of_value
  |> Printf.sprintf "[Patch Error] %s: %s" msg
  |> failwith

let types   = ref []
let imports = ref []
let funcs   = ref []
let globals = ref []
let tables  = ref []
let mems    = ref []
let tags    = ref []
let elems   = ref []
let datas   = ref []
let starts  = ref None
let exports = ref []

let imported_funcs   = ref []
let imported_globals = ref []
let imported_tables  = ref []
let imported_mems    = ref []
let imported_tags    = ref []

let classify_imports () =
  let has_kind kind import =
    import
    |> casev_nth_arg 2
    |> casev_get_case
    |> (=) kind in
  imported_funcs := List.filter (has_kind "FUNC") !imports;
  imported_globals := List.filter (has_kind "GLOBAL") !imports;
  imported_tables := List.filter (has_kind "TABLE") !imports;
  imported_mems := List.filter (has_kind "MEM") !imports;
  imported_tags := List.filter (has_kind "TAG") !imports;
  ()

(** Hardcoded patches to make module valid **)
(* TODO: Remove these hardcodenesses *)

(* expr *)
let rec patch_instr instr =
  let open Backend_interpreter in
  match instr with
  (* Handle recursive case *)
  | CaseV (name, [ bt; instrs ]) when name = "BLOCK" || name = "LOOP" ->
    let patched_instrs =
      instrs |> unwrap_listv_to_list |> List.map patch_instr |> listV_of_list in
    CaseV (name, [ bt; patched_instrs ])
  | CaseV ("IF", [ bt; instrs1; else_; instrs2 ]) ->
    let patched_instrs1 =
      instrs1 |> unwrap_listv_to_list |> List.map patch_instr |> listV_of_list in
    let patched_instrs2 =
      instrs2 |> unwrap_listv_to_list |> List.map patch_instr |> listV_of_list in
    CaseV ("IF", [ bt; patched_instrs1; else_; patched_instrs2 ])
  | CaseV ("TRY_TABLE", [ bt; catches; instrs ]) ->
    let patched_instrs =
      instrs |> unwrap_listv_to_list |> List.map patch_instr |> listV_of_list in
    CaseV ("TRY_TABLE", [ bt; catches; patched_instrs ])
  (* Patch individual instructions *)
  | CaseV (("CONST" | "VCONST"), [ vt; _ ]) ->
    (match vt with
    | CaseV ("I32", []) ->
      let focus_on_validity = Random.int 10 <> 0 in
      if focus_on_validity then
        instr
      else
        caseV ("CONST", [ vt; natV (gen_bytes 4) ])
    | CaseV ("F32", []) -> caseV ("CONST", [ vt; Construct.(al_of_floatN layout32) (gen_bytes 4) ])
    | CaseV ("I64", []) ->
      let focus_on_validity = Random.int 10 <> 0 in
      if focus_on_validity then
        instr
      else
        caseV ("CONST", [ vt; natV (gen_bytes 8) ])
    | CaseV ("F64", []) -> caseV ("CONST", [ vt; Construct.(al_of_floatN layout64) (gen_bytes 8) ])
    | CaseV ("V128", []) -> caseV ("VCONST", [ vt; natV (gen_bytes 16) ])
    | _ -> error "Invalid const instruction" instr
    )
  | CaseV ("VCVTOP", [sh1; sh2; CaseV ("EXTEND", _) as vcvtop; _; _]) ->
    let half = choose ["LOW"; "HIGH"] in
    CaseV ("VCVTOP", [sh1; sh2; vcvtop; some half; none "ZERO"])
  | CaseV ("VCVTOP", [sh1; sh2; CaseV (("TRUNC_SAT" | "DEMOTE"), _) as vcvtop; _; _]) ->
    CaseV ("VCVTOP", [sh1; sh2; vcvtop; none "LOW"; some "ZERO"])
  | CaseV ("VCVTOP", [sh1; sh2; CaseV ("RELAXED_TRUNC", _) as vcvtop; _; _]) ->
    CaseV ("VCVTOP", [sh1; sh2; vcvtop; none "LOW"; none "ZERO"])
  | CaseV ("VCVTOP", [sh1; sh2; CaseV ("PROMOTE", _) as vcvtop; _; _]) ->
    CaseV ("VCVTOP", [sh1; sh2; vcvtop; some "LOW"; none "ZERO"])
  | CaseV ("VCVTOP", [ CaseV ("X", [ _; m1 ]) as sh1; CaseV ("X", [ _; m2 ]) as sh2; CaseV ("CONVERT", _) as vcvtop; _; _]) ->
    if m1 = m2 then
      CaseV ("VCVTOP", [sh1; sh2; vcvtop; none "LOW"; none "ZERO"])
    else
      CaseV ("VCVTOP", [sh1; sh2; vcvtop; some "LOW"; none "ZERO"])
  | instr -> instr
let patch_expr expr = expr |> unwrap_listv_to_list |> List.map patch_instr |> listV_of_list

(* type *)
let patch_type type_ = type_
let patch_types types = List.map patch_type types

(* import *)
let patch_import import = import
let patch_imports imports = List.map patch_import imports

(* func *)

let patch_func = function
  | CaseV ("FUNC", [ typeidx; locals; expr ]) ->
    caseV ("FUNC", [ typeidx; locals; patch_expr expr ])
  | func -> error "Invalid func" func
let patch_funcs funcs = List.map patch_func funcs

(* global *)
let patch_global = function
  | CaseV ("GLOBAL", [ globaltype; expr ]) ->
    CaseV ("GLOBAL", [ globaltype; patch_expr expr ])
  | global -> error "Invalid global" global
let patch_globals globals = List.map patch_global globals

(* table *)
let patch_table = function
  | CaseV ("TABLE", [ tabletype; expr ]) ->
    caseV ("TABLE", [ tabletype; patch_expr expr ])
  | table -> error "Invalid table" table
let patch_tables tables = List.map patch_table tables

(* mem *)
let patch_mem mem = mem
let patch_mems mems =
  if !Flag.version = 3 then mems else
  match mems with
  | [] -> []
  | mem :: _ -> [patch_mem mem]

(* tag *)
let patch_tags tags = tags

(* elem *)
let patch_mode rt = function
  | CaseV ("ACTIVE", [ tid; expr ]) -> (* HARDCODE: Elemmode_ok/active *)
    let tid' = unwrap_natv_to_int tid in
    let is_table v = v |> casev_nth_arg 2 |> casev_get_case = "TABLE" in
    let imported_tables = !imports |> List.filter is_table in
    let rt' =
      if tid' >= List.length imported_tables then
        let table = List.nth !tables (tid' - List.length imported_tables) in
        casev_nth_arg 0 table |> casev_nth_arg 2
      else
        let import = List.nth imported_tables tid' in
        casev_nth_arg 2 import |> casev_nth_arg 0 |> casev_nth_arg 2
    in
    if (rt = rt') then
      CaseV ("ACTIVE", [ tid; patch_expr expr ])
    else
      choose [ nullary "PASSIVE"; nullary "DECLARE" ]
  | v -> v
let patch_elem = function
  | CaseV ("ELEM", [ rt; exprs; mode ]) ->
    let exprs' = exprs |> unwrap_listv_to_list |> List.map patch_expr |> listV_of_list in
    CaseV ("ELEM", [ rt; exprs'; patch_mode rt mode ])
  | v -> v
let patch_elems elems = List.map patch_elem elems

(* data *)
let patch_data data =
  let datamode = match casev_nth_arg 1 data with
    | CaseV ("ACTIVE", [mid; init]) when Random.int 5 = 0 ->
      CaseV ("ACTIVE", [mid; patch_expr init])
    | v -> v
  in
  casev_replace_nth_arg 1 datamode data
let patch_datas datas = List.map patch_data datas

(* start *)
let patch_start start =
  let fid = start |> casev_nth_arg 0 |> unwrap_natv_to_int in
  let fs = !funcs in
  let is_ok f =
    let tid = casev_nth_arg 0 f |> unwrap_natv_to_int in
    let t = (try List.nth !types tid with _ -> failwith (string_of_int tid)) |> casev_nth_arg 0 in
    t = tupV [empty_list; empty_list] in
  let f = List.nth fs fid in (* TODO: Consider imported funcs *)
  if is_ok f then Some start else
  let candidates = find_index_all is_ok fs in
  if candidates = [] then None else
    Some (caseV ("START", [natV_of_int (choose candidates)]))
let patch_starts starts =
  (* Option.bind starts patch_start *)
  starts

(* export *)
let dedup_names exports =
  let rec dedup_names' names es = match es with
  | [] -> []
  | e :: es' ->
    let name = casev_nth_arg 0 e |> unwrap_textv in
    if List.mem name names then
      let name' = TextV (name ^ "'") in
      let e' = casev_replace_nth_arg 0 name' e in
      dedup_names' names (e' :: es')
    else
      let names' = name :: names in
      e :: dedup_names' names' es'
  in
  dedup_names' [] (unwrap_listv_to_list exports) |> listV_of_list
let patch_export export = export
let patch_exports exports = List.map patch_export exports
  (* |> dedup_names *)

(** wrapping functions for nontrivial parameter **)

let get_functype func =
  let fst_3 (e, _, _) = e in
  let thd_3 (_, _, e) = e in
  let al_to_nat = Backend_interpreter.Construct.al_to_nat in
  let unwrap_listv = unwrap_listv_to_list in
  let unwrap_type = function
    | CaseV ("TYPE", [ type_ ]) -> type_
    | v -> error "Invalid type" v in
  let unwrap_func = function
    | CaseV ("FUNC", [ typeidx; locals; expr ]) -> typeidx, locals, expr
    | v -> error "Invalid func" v in
  let unwrap_subtype = function
    | CaseV ("SUB", [ fin; typeuse; comptype ]) -> fin, typeuse, comptype
    | v -> error "Invalid subtype" v in
  let unwrap_rectype = function
    | CaseV ("REC", [ sts ]) -> sts
    | v -> error "Invalid rectype" v in

  let sts = List.concat_map (unwrap_type %> unwrap_rectype %> unwrap_listv) !types in
  match
    func |> unwrap_func |> fst_3 |> al_to_nat
    |> List.nth sts |> unwrap_subtype |> thd_3
  with
  | CaseV ("FUNC", [ CaseV ("->", [ rt1; rt2 ]) ]) -> rt1, rt2
  | comptype -> error "Invalid function type" comptype

let has_nontrivial_parameter func =
  let unwrap_listv = unwrap_listv_to_list in
  let is_nontrivial_valtype = function
    | CaseV ("REF", _) -> true
    | _ -> false in

  func |> get_functype |> fst |> unwrap_listv |> List.exists is_nontrivial_valtype

let is_trivial_func_export funcidxs export =
  let al_to_nat = Backend_interpreter.Construct.al_to_nat in
  let unwrap_export = function
    | CaseV ("EXPORT", [ name; externidx ]) -> name, externidx
    | v -> error "Invalid export" v in

  match export |> unwrap_export |> snd with
  | CaseV ("FUNC", [ funcidx ]) -> List.mem (al_to_nat funcidx) funcidxs
  | CaseV (("GLOBAL" | "TABLE" | "MEM" | "TAG"), [ _idx ]) -> false
  | externidx -> error "Invalid externidx" externidx

let flatten types =
  let aux ty = ty |> casev_nth_arg 0 |> casev_nth_arg 0 |> unwrap_listv_to_list in
  List.concat_map aux types

let rec construct_const valtype =
  let al_of_nat = Backend_interpreter.Construct.al_of_nat in
  let al_of_float float =
    float
    |> Reference_interpreter.F32.of_float
    |> Backend_interpreter.Construct.al_of_float32 in
  let listV = listV_of_list in
  let comptype_to_type comptype =
    let subtype = caseV ("SUB", [ some "FINAL"; empty_list; comptype ]) in
    caseV ("TYPE", [ caseV ("REC", [ listV [ subtype ] ]) ]) in

  match valtype with
  (* i32, i64 *)
  | CaseV (("I32" | "I64"), []) ->
    [ CaseV ("CONST", [ valtype; al_of_nat 0 ]) ]
  (* f32, f64 *)
  | CaseV (("F32" | "F64"), []) ->
    [ CaseV ("CONST", [ valtype; al_of_float 0. ]) ]
  (* v128 *)
  | CaseV ("V128", []) ->
    [ CaseV ("VCONST", [ valtype; al_of_nat 0 ]) ]
  (* ref null `ht` *)
  | CaseV ("REF", [ OptV (Some (CaseV ("NULL", []))); ht ]) ->
    let must_nul = Random.bool () in
    if must_nul then
      [ caseV ("REF.NULL", [ ht ]) ]
    else
      construct_const (caseV ("REF", [ none "NULL"; ht ]))
  (* ref `ht` *)
  | CaseV ("REF", [ OptV None; ht ]) ->
    let get_case_name = function
      | CaseV (name, _) -> name
      | v -> error "Invalid heaptype" v in

    (match get_case_name ht with
    | "ANY" | "EQ" ->
      let ht' = [ "I31"; "STRUCT"; "ARRAY" ] |> choose |> nullary in
      construct_const (caseV ("REF", [ optV None; ht' ]))
    | "I31" ->
      [ caseV ("CONST", [ nullary "I32"; al_of_nat 0 ]);
        nullary "REF.I31"
      ]
    | "STRUCT" ->
      let typeidx = List.length @@ flatten !types in
      let type_ =
        caseV ("STRUCT", [ listV [ caseV ("", [some "MUT"; nullary "I32"]) ] ])
        |> comptype_to_type in
      types := !types @ [ type_ ];

      [ caseV ("STRUCT.NEW_DEFAULT", [ al_of_nat typeidx ]) ]
    | "ARRAY" ->
      let typeidx = List.length @@ flatten !types in
      let type_ =
        caseV ("ARRAY", [ caseV ("", [ some "MUT"; nullary "I32" ]) ])
        |> comptype_to_type in
      types := !types @ [ type_ ];

      [ caseV ("CONST", [ nullary "I32"; al_of_nat 0 ]);
        caseV ("ARRAY.NEW_DEFAULT", [ al_of_nat typeidx ])
      ]
    | "FUNC" -> [ caseV ("REF.FUNC", [ al_of_nat 0 ]) ]
    | "NONE" | "NOFUNC" | "EXN" | "NOEXN" | "EXTERN" | "NOEXTERN" ->
      valtype
      |> Print.string_of_value
      |> Printf.sprintf "Cannot construct argument with valtype %s"
      |> failwith
    | "_IDX" -> failwith "TODO: idx"
    | _ -> error "Invalid heaptype" ht
    )
  | _ -> error "Invalid valtype" valtype

let construct_wrapper_function funcidx =
  let listV = listV_of_list in
  let unwrap_listv = unwrap_listv_to_list in
  let al_of_nat = Backend_interpreter.Construct.al_of_nat in
  let comptype_to_type comptype =
    let subtype = caseV ("SUB", [ some "FINAL"; empty_list; comptype ]) in
    caseV ("TYPE", [ caseV ("REC", [ listV [ subtype ] ]) ]) in
  let functype_to_type ft =
    let rt1, rt2 = ft in
    caseV ("FUNC", [ caseV ("->", [ rt1; rt2 ]) ]) |> comptype_to_type in

  let typeidx = !types |> flatten |> List.length |> Backend_interpreter.Construct.al_of_nat in
  let imported_funcs_len = List.length !imported_funcs in
  assert (funcidx >= imported_funcs_len); (* ASSUMPTION: imported function is not exported *)
  let rt1, rt2 = (funcidx - imported_funcs_len) |> List.nth !funcs |> get_functype in
  let type_ = (empty_list, rt2) |> functype_to_type in
  types := !types @ [ type_ ];

  let locals = empty_list in

  let consts = try rt1 |> unwrap_listv |> List.concat_map construct_const with | _ -> [nullary "UNREACHABLE"] in
  let expr = listV (consts @ [ caseV ("CALL", [ al_of_nat funcidx ]) ]) in

  caseV ("FUNC", [ typeidx; locals; expr ])

(* module *)
let patch_module module_ =
  let al_of_nat = Backend_interpreter.Construct.al_of_nat in
  let unwrap_listv = unwrap_listv_to_list in
  let listV = listV_of_list in
  let al_to_nat = Backend_interpreter.Construct.al_to_nat in
  let nth_arg n = module_ |> casev_nth_arg n |> unwrap_listv in
  let replace_export funcidx = function
    | CaseV ("EXPORT", [ name; CaseV ("FUNC", [ numv ]) ]) as v
    when al_to_nat numv = funcidx ->
      let new_funcidx = (List.length !funcs + List.length !imported_funcs) in
      (* convention: invokable function ends with "'" *)
      [ v; caseV ("EXPORT", [ rename (fun x -> x ^ "'") name; caseV ("FUNC", [ al_of_nat new_funcidx ]) ]) ]
    | v -> [v] in

  types   := nth_arg 0;
  imports := nth_arg 1;
  funcs   := nth_arg 2;
  globals := nth_arg 3;
  tables  := nth_arg 4;
  mems    := nth_arg 5;
  tags    := nth_arg 6;
  elems   := nth_arg (if !version = 3 then 7 else 6);
  datas   := nth_arg (if !version = 3 then 8 else 7);
  starts  := unwrap_optv (casev_nth_arg(if !version = 3 then 9 else 8) module_);
  exports := nth_arg (if !version = 3 then 10 else 9);
  classify_imports ();

  let nontrivial_funcidxs =
    !funcs
    |> List.mapi
      (fun i func -> if has_nontrivial_parameter func then
        Some (i + List.length !imported_funcs)
      else
        None
      )
    |> List.filter_map Fun.id
  in

  List.iter
    (fun funcidx ->
      exports := List.concat_map (replace_export funcidx) !exports;
      let wrapper_func = construct_wrapper_function funcidx in
      funcs := !funcs @ [ wrapper_func ];
    )
    nontrivial_funcidxs;

  let types'  = listV (patch_types !types) in
  let imports'= listV (patch_imports !imports) in
  let funcs'  = listV (patch_funcs !funcs) in
  let globals'= listV (patch_globals !globals) in
  let tables' = listV (patch_tables !tables) in
  let mems'   = listV (patch_mems !mems) in
  let tags'   = listV (patch_tags !tags) in
  let elems'  = listV (patch_elems !elems) in
  let datas'  = listV (patch_datas !datas) in
  let starts' = optV (patch_starts !starts) in
  let exports'= listV (patch_exports !exports) in


  CaseV ("MODULE", [
    types';
    imports';
    funcs';
    globals';
    tables';
    mems';
    ] @ (if !version = 3 then [tags'] else []) @ [
    elems';
    datas';
    starts';
    exports';
  ])
