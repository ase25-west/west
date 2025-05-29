# WEST: Specification-Based Test Generation for WebAssembly

This is an anonymized artifact repository for "WEST: Specification-Based Test Generation for WebAssembly",
submitted to the ASE'25.

### Build

We strongly recommend to use docker file, located in [spectec/docker]:

```sh
(cd spectec/docker; docker build .)
```

### Get experiment result

* After `docker build`, run docker image and execute it.
```sh
docker run -dit [image name]
docker exec -it [container name] bash
```

* You should be in `west/spectec` directory. Otherwise, `cd` into spectec directory.
```sh
cd /root/west/spectec
```

* Run `experiment.sh` script.

```sh
script/experiment.sh
```

This will store the raw experiment result to `out-[target]` directories.

* Run `count_bug.sh` script to get detected bugs (RQ1).
```sh
script/count_bug.sh
```

* Run `count_all.sh` script to obtain data for RQ2 and RQ3.
```sh
script/count_all.sh
```

### Found bugs

The information about found bug is located at [spectec/bugs] directory.
