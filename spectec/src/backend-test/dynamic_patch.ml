open Utils

open Al
open Ast
open Al_util

let todo _ = failwith "todo"


let i32 = nullary "I32"
let i32_const i = caseV ("CONST", [ i32; i ])
let i32_const_of_int i = i |> natV_of_int |> i32_const


module Instrument = struct
  type instrs = value list
  type target_type = value
  type target_value = value
  type t =
    { instrs : instrs;
      target_type : target_type;
      target_value : target_value
    }

  let instrs (t: t) = t.instrs
  let target_type (t: t) = t.target_type
  let target_value (t: t) = t.target_value

  let fetch
    (fetching_generator: int -> value -> instrs)
    (target_types: target_type list)
    (target_values: target_value list)
  : t list =
    assert (List.length target_types = List.length target_values);

    let fetching_instrss = List.mapi fetching_generator target_types in

    let create_fetch_t fetching_instrs target_type_value_pair =
      let target_type, target_value = target_type_value_pair in
      { instrs = fetching_instrs; target_type; target_value } in

    List.combine target_types target_values
    |> List.map2 create_fetch_t fetching_instrss

  let rec add_structaddr_check
    (module_: value)
    (fetching_instrs: instrs)
    (structaddr: value)
  : t list =

    (* Obtain field's type and field's value *)

    let structinst =
      Backend_interpreter.Ds.Store.access "STRUCTS"
      |> Fun.flip listv_nth (unwrap_numv_to_int structaddr) in
    let typeidx =
      structinst
      |> strv_access "TYPE"
      |> get_typeidx module_ in
    let field_types =
      structinst
      (* deftype *)
      |> strv_access "TYPE"
      (* comptype *)
      |> unwrap_deftype_to_comptype
      (* structtype *)
      |> casev_nth_arg 0
      (* fieldtypes *)
      |> unwrap_listv_to_list
      (* storagetypes *)
      |> List.map (casev_nth_arg 1) in
    let unpacked_field_types = List.map unpack field_types in
    let field_vals =
      structinst
      |> strv_access "FIELDS"
      |> unwrap_listv_to_list in
    let unpacked_field_vals = List.map unsigned_unpack field_vals in

    (* Fetch fields *)

    let struct_field_fetching_generator idx unpacked_field_type =
      let field_type = List.nth field_types idx in
      let sx_opt = if field_type = unpacked_field_type then none "U" else some "U" in
      fetching_instrs
      @ [ caseV ("REF.CAST", [ reftype_of_typeidx typeidx ]);
          caseV ("STRUCT.GET", [ sx_opt; natV_of_int typeidx; natV_of_int idx ]);
        ] in
    let fetch_ts =
      fetch
        struct_field_fetching_generator
        unpacked_field_types
        unpacked_field_vals in

    (* Add return check for fields *)

    List.concat_map (add_return_check module_) fetch_ts

  and add_arrayaddr_check
    (module_: value)
    (fetching_instrs: instrs)
    (arrayaddr: value)
  : t list =

    (* Obtain field's type and field's value *)

    let arrayinst =
      Backend_interpreter.Ds.Store.access "ARRAYS"
      |> Fun.flip listv_nth (unwrap_numv_to_int arrayaddr) in
    let typeidx =
      arrayinst
      |> strv_access "TYPE"
      |> get_typeidx module_ in
    let field_type =
      arrayinst
      (* deftype *)
      |> strv_access "TYPE"
      (* comptype *)
      |> unwrap_deftype_to_comptype
      (* arraytype = fieldtype *)
      |> casev_nth_arg 0
      (* storagetypes *)
      |> casev_nth_arg 1 in
    let unpacked_field_type = unpack field_type in
    let field_vals =
      arrayinst
      |> strv_access "FIELDS"
      |> unwrap_listv_to_list in
    let unpacked_field_vals = List.map unsigned_unpack field_vals in
    let unpacked_field_types =
      List.init (List.length unpacked_field_vals) (fun _ -> unpacked_field_type) in

    (* Fetch fields *)

    let array_field_fetching_generator idx _ =
      let sx_opt =
        if field_type = unpacked_field_type then none "U" else some "U" in
      fetching_instrs
      @ [ caseV ("REF.CAST", [ reftype_of_typeidx typeidx ]);
          i32_const_of_int idx;
          caseV ("ARRAY.GET", [ sx_opt; natV_of_int typeidx ]);
        ] in
    let fetch_ts =
      fetch
        array_field_fetching_generator
        unpacked_field_types
        unpacked_field_vals in

    (* Add return check for fields *)

    List.concat_map (add_return_check module_) fetch_ts

  and add_return_check
    (module_: value)
    (fetch_t: t)
  : t list =
    let fetching_instrs = fetch_t.instrs in

    match fetch_t.target_type with
    (* Number type & Vector type *)
    | CaseV (("I32" | "I64" | "F32" | "F64" | "V128"), _) -> [ fetch_t ]
    (* Reference type *)
    | _ ->
      match fetch_t.target_value with
      | CaseV ("REF.NULL", _) -> [ fetch_t ]
      | CaseV ("REF.I31_NUM", [ num ]) ->
        let checking_instrs =
          [ caseV ("REF.CAST", [ caseV ("REF", [ none "NULL"; nullary "EQ" ]) ]);
            i32_const num;
            nullary "REF.I31";
            nullary "REF.EQ";
          ] in
        [ { instrs = fetching_instrs @ checking_instrs;
            target_type = i32;
            target_value = i32_const_of_int 1;
          }
        ]
      (* Recursive case *)
      | CaseV ("REF.STRUCT_ADDR", [ structaddr ]) ->
        add_structaddr_check module_ fetching_instrs structaddr
      | CaseV ("REF.ARRAY_ADDR", [ arrayaddr ]) ->
        add_arrayaddr_check module_ fetching_instrs arrayaddr
      | CaseV ("REF.FUNC_ADDR", [ funcaddr ]) ->
        (* Check function type *)
        (* TODO: More precise checking *)
        let checking_instrs =
          funcaddr
          (* funcinst *)
          |> unwrap_numv_to_int
          |> listv_nth (Backend_interpreter.Ds.Store.access "FUNCS")
          (* deftype *)
          |> strv_access "TYPE"
          (* typeidx *)
          |> get_typeidx module_
          (* reftype *)
          |> reftype_of_typeidx
          (* checking instrs *)
          |> fun reftype -> [ caseV ("REF.TEST", [ reftype ]) ] in
        [ { instrs = fetching_instrs @ checking_instrs;
            target_type = i32;
            target_value = i32_const_of_int 1;
          }
        ]
      | CaseV ("REF.EXTERN", [ addrref ]) ->
        (* Fetch addrref *)
        let extern_fetching_generator _ _ =
          fetching_instrs @ [ nullary "ANY.CONVERT_EXTERN" ] in
        let addrref_type = fetch_t |> target_type |> casev_nth_arg 0 in
        let new_fetch_t =
          fetch extern_fetching_generator [ addrref_type ] [ addrref ]
          |> List.hd in

        (* Add return check for addrref *)
        add_return_check module_ new_fetch_t
      | CaseV ("REF.EXN_ADDR", _)
      | CaseV ("REF.HOST_ADDR", _) ->
        fetch_t.target_value
        |> Print.string_of_value
        |> Printf.sprintf "Cannot generate checking instruction for return value: %s"
        |> failwith
      | _ ->
        Printf.sprintf "Invalid return value %s with type %s"
          (Print.string_of_value fetch_t.target_value)
          (Print.string_of_value fetch_t.target_type)
        |> failwith
end

let patch_invoke_result module_ = function
  | fname, args, Ok return_values
  when List.exists is_non_null_reference_value return_values ->

    (* Get return type *)

    let funcidx =
      module_
      (* exports *)
      |> casev_nth_arg 10
      (* export *)
      |> listv_find (fun export -> export |> casev_nth_arg 0 |> name_to_string = fname)
      (* externidx *)
      |> casev_nth_arg 1
      (* funcidx *)
      |> casev_nth_arg 0
      |> unwrap_numv_to_int in
    let is_func_import import =
      import
      |> casev_nth_arg 2
      |> casev_get_case
      |> (=) "FUNC" in
    let imported_funcs_num =
      module_
      |> casev_nth_arg 1
      |> unwrap_listv_to_list
      |> List.filter is_func_import
      |> List.length in
    let func =
      module_
      |> casev_nth_arg 2
      |> Fun.flip listv_nth (funcidx - imported_funcs_num) in
    let typeidx =
      func
      |> casev_nth_arg 0
      |> unwrap_numv_to_int in
    let functype =
      module_
      (* types *)
      |> casev_nth_arg 0
      |> unwrap_listv_to_list
      (* deftype *)
      |> List.concat_map wrap_type_
      |> Fun.flip List.nth typeidx
      (* comptype *)
      |> unwrap_deftype_to_comptype
      (* functype *)
      |> casev_nth_arg 0 in
    let return_type = casev_nth_arg 1 functype in

    (* Create fetching instrument *)

    let local_fetching_generator idx _ =
      [ caseV ("LOCAL.GET", [ natV_of_int idx ]) ] in
    let fetch_instruments =
      Instrument.fetch
        local_fetching_generator
        (unwrap_listv_to_list return_type)
        return_values in

    (* Create checking instrument *)

    let check_instruments =
      fetch_instruments
      |> List.concat_map (Instrument.add_return_check module_) in
    let checking_instrs = List.concat_map Instrument.instrs check_instruments in
    let new_return_types = List.map Instrument.target_type check_instruments in
    let new_return_values = List.map Instrument.target_value check_instruments in

    (* Patch module *)

    let new_module_ =
      match module_ with
      | CaseV (
        "MODULE",
        [ types; imports; funcs; globals; tables;
          mems; tags; elems; datas; start_opt; exports;
        ]
      ) ->
        (* Append new type *)

        let param_type = casev_nth_arg 0 functype in
        let new_return_type = listV_of_list new_return_types in
        let wrapper's_type_ =
          functype_to_type_ (caseV ("->", [ param_type; new_return_type ])) in

        let checker's_type_ =
          caseV ("->", [ return_type; new_return_type ])
          |> functype_to_type_ in

        let new_type_section =
          types
          |> unwrap_listv_to_list
          |> Fun.flip List.append [ wrapper's_type_; checker's_type_ ]
          |> listV_of_list in

        let flatten types =
          let aux ty = ty |> casev_nth_arg 0 |> casev_nth_arg 0 |> unwrap_listv_to_list in
          List.concat_map aux types in

        let type_section_length =
          types
          |> unwrap_listv_to_list
          |> flatten
          |> List.length in

        (* Add checking function *)

        let checker's_typeidx = natV_of_int (type_section_length + 1) in
        let checker's_locals =
          listv_map (fun vt -> caseV ("LOCAL", [ vt ])) return_type in
        let checker_func =
          caseV (
            "FUNC",
            [ checker's_typeidx;
              checker's_locals;
              listV_of_list checking_instrs
            ]
          ) in
        let checker's_funcidx =
          funcs
          |> unwrap_listv_to_list
          |> List.length
          |> (+) imported_funcs_num
          |> (+) 1 in

        (* Add wrapper function for invocation *)

        let wrapper's_typeidx = natV_of_int type_section_length in

        let locals = casev_nth_arg 1 func in

        let local_gets =
          param_type
          |> unwrap_listv_to_list
          |> List.length
          |> Fun.flip
            List.init (fun idx -> caseV ("LOCAL.GET", [ natV_of_int idx ])) in
        let wrapper's_expr =
          local_gets
          @ [ caseV ("CALL", [ natV_of_int funcidx ]);
              caseV ("CALL", [ natV_of_int checker's_funcidx ])
            ]
          |> listV_of_list
        in

        let wrapper_func =
          caseV ("FUNC", [ wrapper's_typeidx; locals; wrapper's_expr ]) in

        let wrapper's_funcidx =
          funcs
          |> unwrap_listv_to_list
          |> List.length
          |> (+) imported_funcs_num in

        let new_func_section =
          funcs
          |> unwrap_listv_to_list
          |> Fun.flip List.append [ wrapper_func; checker_func ]
          |> listV_of_list in

        (* Patch export *)

        let patch_export = function
          | CaseV ("EXPORT", [ name; CaseV ("FUNC", [ num ]) ]) as v
          when unwrap_numv_to_int num = funcidx ->
            [
              v;
              caseV ("EXPORT", [ rename (fun x -> x ^ "'") name; unary "FUNC" (natV_of_int wrapper's_funcidx) ])
            ]
          | export -> [export] in
        let new_export_section = listv_concat_map patch_export exports in

        caseV (
          "MODULE",
          [ new_type_section; imports; new_func_section; globals; tables;
            mems; tags; elems; datas; start_opt; new_export_section;
          ]
        )
      | _ -> assert (false) in

    new_module_, (fname ^ "'", args, Ok new_return_values)
  | fname, args, e -> module_, (fname, args, e)

let patch module_ = function
  | Ok l ->
    let folder invoke_result acc =
      let acc_module_, acc_result = acc in
      let new_module_, new_result = patch_invoke_result acc_module_ invoke_result in
      new_module_, new_result :: acc_result in
    let patched_module_, patched_result = List.fold_right folder l (module_, []) in
    patched_module_, Ok patched_result
  | result -> module_, result
