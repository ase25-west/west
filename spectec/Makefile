# Configuration

NAME = watsup
EXT = $(NAME)
LOG = _log


# Main targets

.PHONY: default all ci

default: exe
all: exe latex
ci: all


# Executable

EXE = exe-$(NAME)/main.exe
SRCDIR = src
OUTDIR = _build/default/src
ROOTDIR = ..
REFINTERPDIR = $(ROOTDIR)/interpreter
CLONEDIR = src/backend-interpreter/reference-interpreter
CLONERM = dune-project jslib

.PHONY: exe

exe: $(CLONEDIR)
	rm -f ./$(NAME)
	dune build $(SRCDIR)/$(EXE)
	ln -f $(OUTDIR)/$(EXE) ./$(NAME)

$(CLONEDIR): $(shell find $(REFINTERPDIR) -type f)
	rm -rf $(CLONEDIR)
	cp -R $(REFINTERPDIR) $(CLONEDIR)
	rm -r $(CLONERM:%=$@/%)
	cp $@/../dune-ref-interp $@/dune
	cp $(ROOTDIR)/interpreter/exec/fxx.ml $@/exec/


# Latex

.PHONY: latex

latex: exe
	(cd test-latex && make all)


# Spec

.PHONY: spec spec-pdf

spec:
	(cd ../document/core && make main)

spec-pdf:
	(cd ../document/core && make pdf)


# Cleanup

.PHONY: clean distclean

clean:
	dune clean
	rm -f src/frontend/parser.{automaton,conflicts}
	for dir in $(TESTDIRS); do (cd $$dir && make clean); done

distclean: clean
	rm -f ./$(NAME)
	rm -rf $(CLONEDIR)
	for dir in $(TESTDIRS); do (cd $$dir && make distclean); done

specclean:
	(cd ../document/core && make clean)
