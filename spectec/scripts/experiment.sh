do_conform_test()
{
target=$1
seed=$2
time=86400 # 24 hours

out=out-$target

mkdir -p $out

cmd="./watsup spec/wasm-$target/*.watsup --test \
--test:seed $seed \
--test:n 1000000 \
--test:time $time \
--test:out $out \
--test:target $target \
--test:clean \
--test:module-num 2 \
--test:cov \
--test:log 2"

echo "============"
echo "$cmd"
echo "$cmd" > $out/cmd
git show --oneline -s > $out/commit

eval "$cmd" > $out/result 2> $out/err
}

seed="${1:-0}000000"

make

do_conform_test "wasmer" "$seed"
do_conform_test "wasmtime" "$seed"
do_conform_test "sm" "$seed"
do_conform_test "v8" "$seed"
do_conform_test "jsc" "$seed"
