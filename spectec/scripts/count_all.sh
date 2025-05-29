count_all()
{
target=$1
out=out-$target

valid=$(wc -l < $out/time.txt)
invalid=$(grep -o " west error: .*" $out/result | wc -l)
total=$((valid+invalid))
percent=$(awk -v a="$valid" -v b="$invalid" 'BEGIN { printf "%.2f", 100 * a / (a + b) }')
covered=$(tail -n 2 $out/result | head -n 1)

echo "[$target]"

printf "valid:"
echo $valid

printf "invalid:"
echo $invalid

printf "total:"
echo $total

printf "percent:"
echo "$percent%"

echo $covered

echo ""
}

count_all "wasmtime"
count_all "wasmer"
count_all "v8"
count_all "sm"
count_all "jsc"
