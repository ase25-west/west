open Util.Source
open Langs

(* Custom Operators *)
let (%>) f g v = f v |> g
let (let*) = Option.bind

(* Random utils *)
exception EmptyChoosei
let choosei l =
  let n = List.length l in
  if n = 0 then raise EmptyChoosei else
  let i = Random.int n in
  i, List.nth l i
let choose l = choosei l |> snd
let (//) x y = choose [x; y]

let choosei_candidate is_candidate xs =
  xs
  |> List.mapi (fun i x -> i, x)
  |> List.filter_map (fun (i, x) -> let* y = is_candidate x in Some (i, y))
  |> choose

let find_index_all f l =
  let fi i x = if f x then Some i else None in
  l |> List.mapi fi |> List.filter_map (fun o -> o)

let groupix_by f xs =
  let ixs = List.mapi (fun i x -> (i, x)) xs in
  List.fold_left (fun groups (i, x) ->
    let tag = f x in
    let rec new_ groups = match groups with
    | [] -> [ tag, [ (i, x) ] ]
    | (tag', ixs) :: gs when tag = tag' -> (tag, (i, x) :: ixs) :: gs
    | g :: gs -> g :: new_ gs in
    new_ groups
  ) [] ixs

let groupi_by f xs =
  groupix_by f xs |> List.map (fun (tag, ixs) -> (tag, List.map fst ixs))

let group_by f xs =
  groupix_by f xs |> List.map (fun (tag, ixs) -> (tag, List.map snd ixs))

(* List utils *)
let rec dedup eq = function
| [] -> []
| hd :: tl -> hd :: dedup eq (List.filter (Fun.negate @@ eq hd) tl)

let rec count_freq eq = function
| [] -> []
| hd :: tl ->
  let sames, diffs = List.partition (eq hd) tl in
  (hd, 1 + List.length sames) :: count_freq eq diffs

(* Pair utils *)
let apply_fst f (x, y) = (f x, y)
let apply_snd f (x, y) = (x, f y)

(* Interesting values *)
module IntSet = Set.Make (Z)
module Interesting = Map.Make (Int)
let interesting_value_map =

  (* generating interesting values given number of bits *)
  let gen_interesting_integers num_bits =
    assert (num_bits > 0);

    let rec aux num_bits acc =
      if num_bits = 0 then acc
      else if num_bits > 0 then
        (* 2^(n-1) *)
        let v = Z.shift_left Z.one (num_bits-1) in
        (* 2^(n-1), 2^(n-1)+1, 2^n-1 *)
        [ v; Z.succ v; Z.pred (Z.shift_left v 1) ]
        |> IntSet.of_list
        |> IntSet.union acc
        |> aux (num_bits-1)
      else assert false
    in
    let interesting_values = aux num_bits IntSet.empty in

    interesting_values
    (* Add negative interesting integers *)
    |> IntSet.map Z.neg
    (* Add min integer *)
    |> IntSet.add (Z.shift_left Z.minus_one num_bits)
    |> IntSet.union interesting_values
  in

  let bit_widths = [ 8; 16; 32; 64 ] in
  List.fold_right
    (* TODO: Fix inconsistency *)
    (fun i -> Interesting.add i (gen_interesting_integers (i-1)))
    bit_widths
    Interesting.empty

let append_byte bs b = Z.(logor (shift_left bs 8) b)
let gen_byte _ = Random.int 256 |> Z.of_int
let gen_bytes n = List.init n gen_byte |> List.fold_left append_byte Z.zero

(* TODO: move this to al/walk.ml *)
open Al.Ast

let get_bitwidth = function
  | CaseV ("I8", []) -> 8
  | CaseV ("I16", []) -> 16
  | CaseV (("I32"|"F32"), []) -> 32
  | CaseV (("I64"|"F64"), []) -> 64
  | _ -> failwith "Invalid type"

let rec walk_value f v =
  let new_ = walk_value f in
  match f v with
  | NumV _
  | BoolV _
  | TextV _
  | FnameV _ -> v
  | ListV a -> ListV (ref (Array.map new_ !a))
  | StrV r -> StrV (Util.Record.map Fun.id new_ r)
  | CaseV (c, vl) -> CaseV (c, List.map new_ vl)
  | OptV v_opt ->  OptV (Option.map new_ v_opt)
  | TupV vl -> TupV (List.map new_ vl)

let copy_value = walk_value (fun v -> v)

(* Stack utils *)
let push v s = s := v :: !s
let pop s = s := List.tl !s
let top s = List.hd !s
let string_of_stack s = String.concat "," !s

(* Rejection sampling *)
exception OutOfLife of string

let trace_exc msg e = Log.trace @@ msg ^ ":" ^ (Printexc.to_string e); None
let raise_OOL msg = fun () -> raise @@ OutOfLife msg
let rec try_n n msg ?(catch = trace_exc msg) ?(on_fail = raise_OOL msg) f =
  if n <= 0 then
    on_fail ()
  else
    match (try f () with | e -> catch e) with
    | Some x -> x
    | None -> try_n (n-1) msg ~catch ~on_fail f

(* Helpers for set-like list *)
let union ?(eq=(=)) lst1 lst2 =
  let rec aux acc = function
    | [] -> acc
    | x :: xs ->
        if List.exists (fun y -> eq x y) acc then
          aux acc xs  (* Skip if x is already in the accumulator *)
        else
          aux (x :: acc) xs
  in
  (* Combine both lists and filter duplicates using eq *)
  let union_lst = aux [] lst1 in
  aux union_lst lst2

let intersect ?(eq=(=)) lst1 lst2 =
  let rec aux acc = function
    | [] -> acc
    | x :: xs ->
        if List.exists (fun y -> eq x y) lst2 then
          aux (x :: acc) xs  (* Add x to the accumulator if it is in lst2 *)
        else
          aux acc xs
  in
  aux [] lst1

(* Ocaml Helpers *)
let sideeffect f v = f v; v
let (|>>) v f = sideeffect f v
let print_list f xs =
  print_string "[";
  List.iter (fun x -> print_string @@ f x ^ "; ") xs;
  print_endline "]"
let print_list_endline f xs =
  print_string "[";
  List.iter (fun x -> print_string @@ "  \n" ^ f x ^ ";") xs;
  print_endline "\n]\n"
let print_opt f x_opt =
  match x_opt with
  | None -> print_endline "None\n"
  | Some x -> print_string @@ "Some(" ^ f x ^ ")\n"
let unless cond x =
  if cond then
    None
  else
    Some x
let (@>) f g x = g (f x)

let read_file (filename : string) : string =
  let chan = open_in filename in
  try
    let len = in_channel_length chan in
    let content = really_input_string chan len in
    close_in chan;
    content
  with e ->
    close_in_noerr chan;
    raise e

let read_ints (filename: string) : int list =
  let ic = open_in filename in
  let rec read_lines acc =
    try
      let line = input_line ic in
      let num = int_of_string line in
      read_lines (num :: acc)
    with
    | End_of_file ->
        close_in ic;
        List.rev acc
    | Failure _ ->
        close_in ic;
        failwith ("Invalid integer in file: " ^ filename)
  in
  read_lines []

(** IL Utils **)
open Il.Ast
open Il.Print

(* Smart IL Constructors *)
let to_phrase ty x = x $$ no_region % ty

let mk_VarT x = VarT (x $ no_region, []) $ no_region

let il_var x t = VarE (x $ no_region) |> to_phrase t
let il_case name tname args =
  CaseE (
    (if name = "" then [] else [Xl.Atom.Atom name |> to_phrase (Xl.Atom.info name)]) :: (List.map (fun _ -> []) args),
    TupE args |> to_phrase (TupT (List.map (fun a -> (a, a.note)) args) $ no_region)
  ) |> to_phrase (mk_VarT tname)
let il_list es t =
  ListE es |> to_phrase (IterT (t, List) $ no_region)
let il_opt e_opt t =
  OptE e_opt |> to_phrase (IterT (t, Opt) $ no_region)
let il_tup es =
  TupE es |> to_phrase (TupT (List.map (fun e -> e, e.note) es) $ no_region)
let some_opt = OptE (Some (il_tup [])) |> to_phrase (IterT (TupT [] $ no_region, Opt) $ no_region)
let none_opt = OptE None |> to_phrase (IterT (TupT [] $ no_region, Opt) $ no_region)
let il_some x t =
  let e = il_case x t [] in
  OptE (Some e) |> to_phrase (IterT (TupT [e, e.note] $ no_region, Opt) $ no_region)
let il_none x t =
  let e = il_case x t [] in
  OptE None |> to_phrase (IterT (TupT [e, e.note] $ no_region, Opt) $ no_region)
let il_nat i =
  if i >= 0 then
    NumE (`Nat (Z.of_int i)) |> to_phrase (NumT `NatT $ no_region)
  else
    failwith (string_of_int i ^ " is not a nattural number")
let il_int i = NumE (`Int (Z.of_int i)) |> to_phrase (NumT `IntT $ no_region)
let il_zero = il_nat 0
let il_fzero = il_case "POS" "fN" [il_case "SUBNORM" "fNmag" [il_zero]]
let il_boolt = BoolT $ no_region
let il_true = BoolE true |> to_phrase il_boolt
let il_false = BoolE false |> to_phrase il_boolt
let il_eq e1 e2 = CmpE (`EqOp, `BoolT, e1, e2) |> to_phrase il_boolt

let wildcard = il_var "_" (mk_VarT "_")

let atomize atom' = atom' $$ no_region % (Xl.Atom.info "")

(* IL getter / setter *)
let remove_sub e =
  match e.it with
  | SubE (e, _, _) -> e
  | _ -> e

let atom_of_mixop mixop =
  match mixop with
  | (atom :: _) :: _ -> atom
  | _ -> failwith (Xl.Mixop.to_string mixop ^ " is not a mixop with at least one atom")

let is_case e =
  match (remove_sub e).it with
  | CaseE _ -> true
  | _ -> false
let mixop_of_case e =
  match (remove_sub e).it with
  | CaseE (mixop, _) -> mixop
  | _ -> failwith (string_of_exp e ^ " is not a CaseE")
let case_of_case e = mixop_of_case e |> atom_of_mixop |> it
let args_of_case e =
  match (remove_sub e).it with
  | CaseE (_, {it = TupE args; _}) -> args
  | _ -> failwith (string_of_exp e ^ " is not a CaseE")
let nth_arg_of_case n e =
  match (remove_sub e).it with
  | CaseE (_, {it = TupE args; _}) ->
    (match List.nth_opt args n with
    | Some e -> e
    | None -> failwith (string_of_exp e ^ " does not have " ^ string_of_int n ^ "th arg")
    )
  | _ -> failwith (string_of_exp e ^ " is not a CaseE")
let rec replace_caseE_arg is re e =
  match is, e.it with
  | _, SubE (e', t1, t2) -> { e with it = SubE (replace_caseE_arg is re e', t1, t2) }
  | [], _ ->
    re
  | i :: is, CaseE (mixop, ({ it = TupE es; _ } as tup)) ->
    let es' = List.mapi (fun i' e' -> if i = i' then replace_caseE_arg is re e' else e') es in
    { e with it = CaseE (mixop, { tup with it = TupE es' })}
  | 0 :: is, CaseE (mixop, e') ->
    { e with it = CaseE (mixop, replace_caseE_arg is re e') }
  | _ -> failwith "Expected a CaseE"
let destruct_case e =
  match e.it with
  | CaseE ([{it = Atom case; _}] :: _, {it = TupE es; _}) -> case, es
  | _ -> failwith @@ "Cannot desturct as case: " ^ (string_of_exp e)

let unwrap_tup e =
  match e.it with
  | TupE es -> es
  | _ -> [e]

(* Il.Eval Wrapper *)
let match_exp e1 e2 s =
  Il.Eval.match_exp !il_env s e1 e2

let has_sametype e1 e2 = Il.Eq.eq_typ e1.note e2.note
let try_match_arg arg rule =
  let RuleD (id, _binds, _mixop, e, prems) = rule.it in
  if id.it = "trans" then None else (* Ignore transitive rules *)
  let param = e in
  let* subst = match_exp arg param Il.Subst.empty in
  Some (subst, prems)
let try_match_rules arg rules =
  List.fold_left (fun (matched_results, contains_irred) rule ->
    try (
      match try_match_arg arg rule with
      | None -> matched_results, contains_irred
      | Some result -> result :: matched_results, contains_irred
    ) with | Il.Eval.Irred -> matched_results, true
  ) ([], false) rules

let reduce_exp e = Il.Eval.reduce_exp !il_env e
let subst_exp s e = Il.Subst.subst_exp s e |> reduce_exp

let rec reduce_prem ?(simple=false) pr =
  Util.Debug_log.(log "utils.reduce_prem"
    (fun _ -> string_of_prem pr)
    (fun prems -> "[" ^ list string_of_prem prems ^ "]")
  ) @@ fun _ ->
  match pr.it with
  | IfPr e ->
    let e' = reduce_exp e in
    (match e'.it with
    | BoolE true -> []
    | _ -> [{pr with it = IfPr (reduce_exp e)}]
    )
  | RulePr ({it = ("Instrs_ok" | "Expand"); _}, _mixop, _e) -> (* Disable some prems *)
    [pr]
  | RulePr (id, mixop, e) ->
    let e' = reduce_exp e in
    let (_mixop, _typ, rules) = Il.Env.find_rel !Langs.il_env id in (* Assert: eq mixop _mixop *)
    let matched_results, contains_irred = try_match_rules e' rules in
    (match matched_results with
    | [] when not contains_irred ->
      [{pr with it = IfPr il_false}]
    | [s, prems] ->
      subst_prems s prems
    | results when List.exists (fun (_s, prems) -> prems = []) results ->
      []
    | results -> (* TODO: handle more than 2 rules *)
      let aux () =
        let drop_first_arg e = (* Assumption: first arg is context *)
          match e.it with
          | TupE (_ :: tl) -> {e with it = TupE tl}
          | _ -> e
        in
        if Il.Free.(free_exp (drop_first_arg e') = empty) then
          [{pr with it = IfPr il_false}] (* It seems that this premise is false *)
        else
          [{pr with it = RulePr (id, mixop, e')}]
      in

      if simple then aux () else

      let premss = List.map (fun (s, prems) ->
        List.map (Il.Subst.subst_prem s) prems |> List.concat_map (reduce_prem ~simple:true)
      ) results in

      if List.exists ((=) []) premss then
        []
      else
        aux ()
    )
  | IterPr (pr', (_, xes)) ->
    let lens =
      List.filter_map (fun (_, e) ->
        match e.it with
        | ListE es -> Some (List.length es)
        | _ -> None
      ) xes
      |> dedup (=)
    in

    (match lens with
    | [] -> [pr] (* Length can not be determined *)
    | [l] ->
      let eqs, xess = List.fold_left_map (fun eqs (x, e) ->
        match e.it with
        | ListE es ->
          eqs, (x, es)
        | VarE x' ->
          let t =
            match e.note.it with
            | IterT (t, _) -> t
            | _ -> failwith "Iter does not have iterT"
          in
          let es = List.init l (fun i -> VarE (x'.it ^ "[" ^ string_of_int i ^ "]" $ no_region) |> to_phrase t) in
          let eq = il_eq e {e with it = ListE es} in
          eq :: eqs, (x, es)
        | _ -> failwith "Unsupported iter"
      ) [] xes in

      let prems1 = List.map (fun eq -> {pr with it = IfPr eq}) eqs in

      let prems2 = List.init l (fun i ->
        let s = List.fold_left (fun s (x, es) ->
          Il.Subst.add_varid s x (List.nth es i)
        ) Il.Subst.empty xess in

        Il.Subst.subst_prem s pr'
      ) in
      (prems1 @ prems2) |> List.concat_map reduce_prem
    | _ -> [{pr with it = IfPr il_false}]
    )
  | _ -> [pr]
and subst_prems s ps = List.map (Il.Subst.subst_prem s) ps |> List.concat_map reduce_prem

let subst_rule s trule =
  let RuleD (id, binds, mixop, e, prems) = trule.it in
  let e' = subst_exp s e in
  let prems' = subst_prems s prems in
  {trule with it = RuleD (id, binds, mixop, e', prems')}

let contains_false prems =
  List.exists (fun p ->
    match p.it with
    | IfPr e ->
      let e' = reduce_exp e in
      e'.it = BoolE false
    | _ -> false
  ) prems

(* IL conversion *)
let exp_to_int e =
  match (reduce_exp e).it with
  | NumE (`Nat z)
  | NumE (`Int z) -> Z.to_int z
  | _ -> failwith (string_of_exp e ^ " is not an integer")

let exp_to_list e =
  match e.it with
  | ListE es -> es
  | _ -> failwith (string_of_exp e ^ " is not a list")

let is_subid_hint id {hintid; hintexp} =
  hintid.it = "subid" &&
  match hintexp.it with
  | TextE id' -> id' = id
  | _ -> false
let has_subid_hint id (_, _, hints) =
  List.exists (is_subid_hint id) hints

(* IL rewrite *)
let replace old_e new_e e =
  if Il.Eq.eq_exp old_e e then new_e else e

let replace_id old_id new_id e =
  match e.it with
  | VarE id when id.it = old_id -> {e with it = VarE {id with it = new_id}}
  | _ -> e

let replace_id_using f e =
  match e.it with
  | VarE id -> {e with it = VarE {id with it = f (id.it)}}
  | _ -> e

let replace_id_with old_id new_e e =
  match e.it with
  | VarE id when id.it = old_id -> new_e
  | _ -> e

(* IL transform *)
open Il2al.Il_walk
let transform_exp f = transform_exp {base_transformer with transform_exp = f}
let transform_typ f = transform_typ {base_transformer with transform_exp = f}
let transform_rule f = transform_rule {base_transformer with transform_exp = f}
let transform_prem f = transform_prem {base_transformer with transform_exp = f}

(* IL collect *)
let collect_exp pred e =
  let es = ref [] in
  transform_exp (fun e ->
    if pred e then push e es;
    e
  ) e |> ignore;
  !es
let rec collect_exp_prem pred prem =
  match prem.it with
  | RulePr (_, _, e)
  | IfPr e -> collect_exp pred e
  | LetPr (e1, e2, _) -> collect_exp pred e1 @ collect_exp pred e2
  | ElsePr -> []
  | IterPr (p, _) -> collect_exp_prem pred p
let collect_exp_rule pred rule =
  let RuleD (_, _, _, e, prems) = rule.it in
  collect_exp pred e @ List.concat_map (collect_exp_prem pred) prems


(* Type-family-based generation *)
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

(* Unification *)
exception UnifyFail of exp * exp
let unify_fail _map e1 e2 =
  raise @@ UnifyFail (e1, e2)

let result_to_subst result =
  List.fold_left (fun s (x, e) ->
    Il.Subst.add_varid s (x $ no_region) e
  ) Il.Subst.empty result
let subst_to_result s =
  Il.Subst.(Map.bindings s.varid)

(* TODO: Eventually, replace this with Il.Eval.subst *)
let unify_exp ?(on_fail=unify_fail) map e1 e2 =
  let s = result_to_subst map in
  try
    let s' = match_exp e1 e2 s |> Option.get in
    subst_to_result s'
  with | _ -> on_fail map e1 e2

(* Wasm specific helpers *)
let get_rules rid =
  List.find_map (fun def ->
    match def.it with
    | Il.Ast.RelD (id, _, _, rules) when Il.Eq.eq_id rid id -> Some rules
    | _ -> None
  ) !il |> Option.get

let get_typing_rules () =
  List.concat_map (fun def ->
    match def.it with
    | Il.Ast.RelD (id, _, _, rules) when id.it = "Instr_ok" || id.it = "Instrf_ok" -> rules
    | _ -> []
  ) !il

let expected_shape e shape =
  Printf.sprintf "Expected %s to be %s" (string_of_exp e) shape |> failwith

let rule_to_rhs_args rule =
  let RuleD (_, _, _, exp, _) = rule.it in
  match exp.it with
  | TupE [_c; _lhs; rhs] ->
    (match rhs.it with
    | CaseE (_, args) ->
      args
    | _ -> expected_shape rhs "e1 -> e2"
    )
  | _ -> expected_shape exp "C |- lhs : rhs"

let rule_to_arrow rule =
  let rec unwrap e =
    match e.it with
    | CaseE ([[]; []], e')
    | TupE [e'] -> unwrap e'
    | _ -> e
  in
  let args = rule_to_rhs_args rule in
  match args.it with
  | TupE [t1; t2] | TupE [t1; _; t2] -> unwrap t1, unwrap t2
  | _ -> expected_shape args "t1, t2 or t1, x*, t2"

let rule_to_local_idx rule =
  let args = rule_to_rhs_args rule in
  match args.it with
  | TupE [_; _] -> []
  | TupE [_; {it = ListE xs; _}; _] -> xs
  | _ -> expected_shape args "t1, t2 or t1, x*, t2"

let rule_to_instr rule =
  let RuleD (_, _, _, exp, _) = rule.it in
  match exp.it with
  | TupE [_c; lhs; _rhs] -> lhs
  | _ -> expected_shape exp "C |- lhs : rhs"

let rule_to_prems rule =
  let RuleD (_, _, _, _, prems) = rule.it in
  prems

let consts = ref []
let const_ctxs = ref []
let estimate_const () =
  let open Il.Ast in
  List.iter (fun def ->
    match def.it with
    | RelD (id, _, _, rules) when id.it = "Instr_const" ->
      List.iter (fun rule -> match rule.it with
        | RuleD (id, _, _, _, []) -> push (String.uppercase_ascii id.it) consts
        | _ -> () (* TODO: conditioned const instrs *)
      ) rules
    | RelD (_, _, _, rules) ->
      List.iter (fun rule ->
        let rec is_const_checking prem =
          match prem.it with
          | RulePr (id, _, _) -> id.it = "Expr_ok_const"
          | IterPr (prem', _) -> is_const_checking prem'
          | _ -> false
        in
        match rule.it with
        | RuleD (_, _, _, args, prems) when List.exists is_const_checking prems ->
          (match args.it with
          | TupE [_; e; _] | TupE [_; e] ->
            (match e.it with
            | CaseE ([ atom ] :: _, _) ->
              push atom.it const_ctxs
            | _ -> ()
            )
          | _ -> ()
          )
        | _ -> ()
      ) rules
    | _ -> ()
  ) !il

let parse_exp' s_e t =
  let e = Frontend.Parse.parse_exp s_e in
  let env = !el_env |> Option.get in
  Frontend.Elab.elab_exp env e t

let parse_exp s_e s_t = parse_exp' s_e (El.Ast.VarT (s_t $ no_region, []) $ no_region)
let parse_exps s_e s_t = parse_exp' s_e (El.Ast.IterT (El.Ast.VarT (s_t $ no_region, []) $ no_region, List) $ no_region)


(** AL utils **)

let name_to_string v =
  let open Al.Al_util in
  match v with
  | Al.Ast.TextV s -> s
  | Al.Ast.ListV vs ->
    !vs
    |> Array.to_list
    |> List.map unwrap_numv_to_int
    |> List.map Char.chr
    |> List.to_seq
    |> String.of_seq
  | _ -> failwith @@ "name_to_string: " ^ Al.Print.string_of_value v

let rename f v =
  let open Al in
  let open Ast in
  let open Al_util in
  match v with
  | TextV s -> TextV (f s)
  | ListV vs ->
    !vs
    |> Array.to_list
    |> List.map unwrap_numv_to_int
    |> List.map Char.chr
    |> List.to_seq
    |> String.of_seq
    |> f
    |> String.to_seq
    |> List.of_seq
    |> List.map Char.code
    |> List.map natV_of_int
    |> listV_of_list
  | _ -> failwith @@ "name_to_string: " ^ Al.Print.string_of_value v

let unwrap_deftype_to_comptype deftype =
  let open Al.Al_util in
  let idx = deftype |> casev_nth_arg 1 |> unwrap_numv_to_int in
  deftype
  |> casev_nth_arg 0
  |> casev_nth_arg 0
  |> Fun.flip listv_nth idx
  |> casev_nth_arg 2

let wrap_type_ type_ =
  let open Al.Al_util in
  let rectype = casev_nth_arg 0 type_ in
  rectype
  |> casev_nth_arg 0
  |> unwrap_listv_to_list
  |> List.length
  |> Fun.flip List.init (fun i -> caseV ("DEF", [ rectype; natV_of_int i ]))

let functype_to_type_ functype =
  let open Al.Al_util in
  caseV (
    "TYPE",
    [ (* rectype *)
      caseV (
        "REC",
        [ listV_of_list
          [ (* subtype *)
            caseV (
              "SUB",
              [ some "FINAL";
                empty_list;
                (* comptype *)
                caseV ("FUNC", [ functype ])
              ]
            )
          ]
        ]
      )
    ]
  )

let unsigned_unpack =
  let open Al.Ast in
  let open Al.Al_util in
  function
  | CaseV ("PACK", [ _; num ]) -> CaseV ("CONST", [ nullary "I32"; num ])
  | val_ -> val_

let unpack =
  let open Al.Ast in
  let open Al.Al_util in
  function
  | CaseV (("I8" | "I16"), []) -> nullary "I32"
  | storagetype -> storagetype

let get_typeidx module_ deftype =
  let open Al.Al_util in
  module_
  |> casev_nth_arg 0
  |> unwrap_listv_to_list
  |> List.concat_map wrap_type_
  |> List.mapi (fun idx e -> idx, e)
  |> List.find_map
    (fun pair -> if snd pair = deftype then Some (fst pair) else None)
  |> Option.get

let reftype_of_typeidx typeidx =
  let open Al.Al_util in
  caseV ("REF", [ none "NULL"; caseV ("_IDX", [ natV_of_int typeidx ]) ])

let is_non_null_reference_value = function
  | CaseV ("REF.NULL", _) -> false
  | CaseV (name, _) when String.starts_with ~prefix:"REF" name -> true
  | _ -> false

let il2al = Il2al.Translate.translate_exp
let exp2val = Backend_interpreter.Interpreter.eval_expr Backend_interpreter.Ds.Env.empty

let empty_module () = parse_exp "MODULE" "module" |> il2al |> exp2val
