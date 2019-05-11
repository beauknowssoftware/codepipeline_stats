SHELL=/bin/bash
.EXPORT_ALL_VARIABLES:
.ONESHELL:
.SHELLFLAGS = -uec
.PHONY: default \
		execute \
		clean

RM = rm -rf

default: execute

node_modules: package.json
	npm i
	touch node_modules

execute: node_modules
	node . ${PIPELINE}

clean:
	${RM} $$(cat ./.gitignore)
