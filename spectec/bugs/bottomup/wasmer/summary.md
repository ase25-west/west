# Bugs of wasmer found by bottom-up west

* runtime info
    - version: 4.3.0
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. Empty passive data segment [WR-01]

Empty data segment results in a parsing failure

* fuzzer info
    - approach: bottom-up
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 30, 47, ...
* [minimal](empty_passie_data.wast)
```wat
(module
  (data)
)
```
* Status: Already Fixed
