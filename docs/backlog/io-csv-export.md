# I/O mapping export to a spreadsheet

ADR 0049 replaced io.csv with io.json, which nobody edits by hand. Some users
still want the mapping in a spreadsheet, to review it with an electrician or to
paste it into a wiring document. A read-only export (one row per channel:
module, port, tag, variable, zone, address, `ioType`, comment) would serve
that, from the viewer's I/O view or as a `pantin io export` command, in CSV
with a header and a byte order mark that Excel accepts. It is an export only:
an import would bring back two sources of truth (see the whole-file import item
in ADR 0049).
