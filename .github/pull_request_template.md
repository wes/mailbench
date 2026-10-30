<!-- Delete the sections that don't apply. -->

### Results
- [ ] Generated with `./mailbench submit`; `summary.json` not edited by hand
- [ ] The corpus matched the published digest, and the machine was calibrated
- [ ] `parity` in run.json says what any client that did not hold the whole mailbox held
- [ ] Released builds of every client
- [ ] `affiliations` is filled in (`[]` for none)

### A client definition
- [ ] Checked with `./mailbench snapshot` at the version in `layout.verified`
- [ ] The only settings changed are listed in `parity`
- [ ] `vendor_maintained` is true if I work on or for this client

### The harness, the method or the site
- [ ] `python3 -m unittest discover -s harness/tests` and `./mailbench validate` pass
- [ ] Anything that changes results is discussed in an issue first: #
