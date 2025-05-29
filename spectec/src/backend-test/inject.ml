open Utils

open Al
open Al_util
open Ast

open Backend_interpreter

let get_function_exports moduleinst =
  moduleinst
  |> strv_access "EXPORTS"
  |> unwrap_listv_to_list
  |> List.filter (fun inst -> inst |> strv_access "ADDR" |> casev_get_case = "FUNC")

let remove_overriddens exportinsts =
  List.fold_right (fun exportinst (acc, names) ->
    let name = exportinst |> strv_access "NAME" |> name_to_string in
    if List.mem (name ^ "'") names then
      (acc, names)
    else
      exportinst :: acc, name :: names
  ) exportinsts ([], [])
  |> fst

let get_funcinst export =
  let funcinsts_in_store = unwrap_listv_to_list (Ds.Store.access "FUNCS") in
  export
  |> strv_access "ADDR"
  |> casev_nth_arg 0
  |> unwrap_numv_to_int
  |> List.nth funcinsts_in_store

let (let*) = Result.bind
type instantiate_result = (value, exn) result
type invoke_result = (value list, exn) result
type inject_result = ((string * value list * invoke_result) list, exn) result

let get_export name modulename =
  modulename
  |> Ds.Register.find
  |> strv_access "EXPORTS"
  |> listv_find
    (fun export -> Construct.al_to_string (strv_access "NAME" export) = name)

let get_externaddr import =
  let module_name = casev_nth_arg 0 import |> Construct.al_to_string in
  let item_name   = casev_nth_arg 1 import |> Construct.al_to_string in
  get_export item_name module_name
  |> strv_access "ADDR"

let instantiate module_: instantiate_result =
  try
    let args = module_ |> casev_nth_arg 1 |> listv_map get_externaddr in
    Ok (Interpreter.instantiate [ module_; args ])
  with e -> Error e


let gen_argument = function
  | Al.Ast.CaseV ("I32", []) as t -> caseV ("CONST", [t; natV (gen_bytes 4)])
  | Al.Ast.CaseV ("F32", []) as t ->
    caseV ("CONST", [t; Construct.(al_of_floatN layout32) (gen_bytes 4)])
  | Al.Ast.CaseV ("I64", []) as t -> caseV ("CONST", [t; natV (gen_bytes 8)])
  | Al.Ast.CaseV ("F64", []) as t ->
    caseV ("CONST", [t; Construct.(al_of_floatN layout64) (gen_bytes 8)])
  | Al.Ast.CaseV ("V128", []) as t -> caseV ("VCONST", [t; natV (gen_bytes 16)])
  | Al.Ast.CaseV ("REF", [OptV (Some _); ht]) when !Flag.version = 3 ->
    caseV ("REF.NULL", [ht])
  | _ -> assert(false)
let gen_arguments funcinst =
  funcinst
  |> strv_access "TYPE"
  |> unwrap_deftype_to_comptype
  |> casev_nth_arg 0
  |> casev_nth_arg 0
  |> unwrap_listv_to_list
  |> List.map gen_argument

let invoke (funcinst, args): string * value list * invoke_result =
  let name = funcinst |> strv_access "NAME" |> name_to_string in
  let addr = funcinst |> strv_access "ADDR" |> casev_nth_arg 0 in

  let store_bak = Ds.Store.get () |> copy_value in
  let result =
    try
      let return_values = Interpreter.invoke [ addr; listV_of_list args ] in
      Ok (unwrap_listv_to_list return_values)
    with e ->
      (match e with
      | Exception.Trap | Exception.Throw -> ()
      | _ -> Ds.Store.set store_bak;
      );
      Error e in
   name, args, result

let inject i module_: inject_result =

  let* moduleinst = instantiate module_ in

  (* Instantiation success at this point *)

  Ds.Register.add ("M" ^ string_of_int i) moduleinst;

  let func_exports =
    get_function_exports moduleinst
    |> remove_overriddens in
  let argss =
    func_exports
    |> List.map get_funcinst
    |> List.map gen_arguments in
  List.combine func_exports argss
  |> List.map invoke
  |> Result.ok

let inject = List.mapi inject
