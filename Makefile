test:
	@node node_modules/lab/bin/lab -m 5000
test-cov:
	@node node_modules/lab/bin/lab -t 100 -v -m 5000
test-cov-html:
	@node node_modules/lab/bin/lab -t 100 -r html -o coverage.html -m 5000

.PHONY: test test-cov test-cov-html
