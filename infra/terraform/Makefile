SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := check
TERRAFORM ?= terraform
export TF_PLUGIN_CACHE_DIR ?= $(abspath ../../.local/terraform-provider-cache)
ROOTS := . bootstrap environments/shared environments/dev environments/prod

.PHONY: check fmt init validate test lint security
check: fmt init validate test

fmt:
	$(TERRAFORM) fmt -check -recursive

init:
	@mkdir -p "$(TF_PLUGIN_CACHE_DIR)"
	@for root in $(ROOTS); do \
		$(TERRAFORM) -chdir=$$root init -backend=false -input=false -lockfile=readonly; \
	done

validate:
	@for root in $(ROOTS); do $(TERRAFORM) -chdir=$$root validate; done

test:
	$(TERRAFORM) test
	python3 -m unittest discover -s tests -v

lint:
	@for root in $(ROOTS); do \
		(cd $$root && tflint --init && tflint --minimum-failure-severity=warning); \
	done

security:
	trivy config --severity HIGH,CRITICAL --exit-code 1 .
