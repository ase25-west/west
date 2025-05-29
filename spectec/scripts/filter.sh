cat ${1:-result} | grep -vE "west error|\
wasmtime: |\
sm: |\
v8: |\
jsc: |\
wasmer: |\
reference interpreter: |\
Syntax Error|\
Generating|\
relaxed_simd" | vim -
