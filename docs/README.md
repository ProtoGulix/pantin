# Pantin documentation

CLAUDE.md at the repository root is the project reference. This folder holds
the detail, loaded on demand.

| Folder | Content |
| --- | --- |
| [decisions](decisions/) | Architecture Decision Records, one short note per decision |
| [spikes](spikes/) | Phase 0 verification reports: what worked, failed, remains unverified |
| [backlog](backlog/) | Ideas outside the current phase scope |

## Writing an ADR

Copy [decisions/template.md](decisions/template.md) to `decisions/NNNN-short-title.md`
with the next free number. An ADR is never edited once accepted: a new ADR
supersedes it and both link to each other.
