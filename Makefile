test:
	@node node_modules/lab/bin/lab -m 2000
test-cov:
	@node node_modules/lab/bin/lab -t 90 -v -m 2000
test-cov-html:
	@node node_modules/lab/bin/lab -r html -o coverage.html -m 2000

.PHONY: test test-cov test-cov-html
