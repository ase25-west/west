# Bugs of wasmtime found by top-down west

* runtime info
    - version: 30.0.2 (398694a59 2025-02-25)
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. Large i31

Found by bottom up

* fuzzer info
    - command: --test:disable-exn --test:approach top-down --test:module-num 2
    - commit: 2f18b44349f6d0117f35dabf369ddd4d86cf702f
    - seed: 47443, 155525
* [minimal](todo.wast)
```wat
(module)
```
* Status: Same bug as bottom-up
