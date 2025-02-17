export GITHUB_TOKEN=$(shell gh auth token)

.PHONY: test
test:
	@act push -j test --container-architecture=linux/$(shell uname -m) --secret GITHUB_TOKEN=${GITHUB_TOKEN}
