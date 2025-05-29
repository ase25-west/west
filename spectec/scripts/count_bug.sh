count_bugs()
{
target=$1
out=out-$target

echo "[$target]"

printf "count:";
grep -o " $target: .*" $out/result | sort -u | wc -l

grep -o " $target: .*" $out/result | sort -u

echo ""
}


count_bugs "wasmtime"
count_bugs "wasmer"
count_bugs "v8"
count_bugs "sm"
count_bugs "jsc"
