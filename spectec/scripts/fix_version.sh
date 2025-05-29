# V8
cd /root/v8/v8
git checkout 4c7d4354137c6500153317d5e562970dfd1fef78
gclient sync
tools/dev/gm.py x64.release

# SM
cd /root/gecko-dev
git fetch --depth=1 --no-tags origin 22ae5ab1f71c28f890438728de02f7419f5e2fdb
git reset --hard 22ae5ab1f71c28f890438728de02f7419f5e2fdb
./mach build

# JSC
#Alreadt Fixed as 9d02067f5de4b0402f58d6c83039e206439a8a8c

# Wasmtime
cd /root/wasmtime
git fetch --depth=1 --no-tags origin 2c2e7cf78d46d3b554e75f2ccc1e83e23c21b88c
git reset --hard 2c2e7cf78d46d3b554e75f2ccc1e83e23c21b88c
cargo build --release

# Wasmer
## Already fixed as 4.4.0
