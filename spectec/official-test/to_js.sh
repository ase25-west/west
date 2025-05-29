for wast in `ls *.wast`; do
  js="${wast%.wast}.js";
  echo "$wast -> $js"
  ../../interpreter/wasm $wast -d -o $js;
done
