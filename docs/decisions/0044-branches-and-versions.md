# 0044. Branches, integration and versions: master receives releases only

- Status: accepted
- Date: 2026-10-12
- Refines: CLAUDE.md sections 7, 8 (hygiene) and 14

## Context

Until 2026-10-12 every commit landed on `master`, which is the public
branch on GitHub (github.com/ProtoGulix/pantin). Work in progress, accepted
by the reviewer but not yet shown to the user, sat on the branch people
clone. On 2026-10-12 the user asked for the same model as their other
project, Tunnel (its ADR 0008: simplified GitFlow, `main` for releases,
`develop` for integration, local guard hooks).

Facts checked on 2026-10-12: the CI workflow (`.github/workflows/check.yml`)
ran on pushes to `main`, a branch that does not exist here, so pushes to
`master` were never checked. The packages are at version `0.0.0`, there is
no tag and no CHANGELOG. The GitHub CLI `gh` is not installed on the
development machine.

## Decision

The model of Tunnel's ADR 0008, with Pantin's names:

1. `master`: releases only, each tagged `vX.Y.Z` (SemVer) with its section
   in `CHANGELOG.md`. No direct commit. It receives only a `--no-ff` merge
   from `develop` (a release) or from a `hotfix/X.Y.Z` branch. The branch
   keeps the name `master`, GitHub's default branch here, so that clones
   and links do not change.
2. `develop`: integration, always green. No direct work commit. It receives
   work branches as squash merges, one Conventional Commits commit per piece
   of work.
3. Work branches, always created from `develop`: `feat/<topic>`,
   `fix/<topic>`, `refactor/<topic>`, `test/<topic>`, `chore/<topic>`,
   `docs/<topic>`. One piece of work, one branch, deleted after the merge.
   A roadmap slice (for example ADR 0043 P3) is one piece of work.
4. Merging into `develop` needs: `pnpm check` green, an APPROVE verdict
   from the reviewer, and the `Unreleased` section of `CHANGELOG.md` updated.
   While `gh` is not installed, the main agent squash merges locally
   (`git merge --squash`, then `PANTIN_INTEGRATION=1 git commit`). Pushing
   `develop` to GitHub is done when the user asks for it.
5. A release is the user's decision: a `chore/release-X.Y.Z` branch from
   `develop` (package versions, dated CHANGELOG section) merged into
   `develop` like any work; then `develop` merged into `master` with
   `--no-ff`, an annotated tag `vX.Y.Z` on that commit, and `master` merged
   back into `develop`. The first release number is chosen by the user.
6. Hotfix: a `hotfix/X.Y.Z` branch from `master`, merged into `master`
   (tag), then into `develop`.
7. An ADR tied to code is the first commit of its work branch and reaches
   `develop` with the code it decides. An ADR without code goes through a
   `docs/adr-NNNN-<topic>` branch.
8. Local guards, run by lefthook (`scripts/git-guards/`):
   - no commit on `master` outside a release (`PANTIN_RELEASE=1`, for the
     commit that ends a conflicted release merge); on `develop` only to
     finish an integration (`PANTIN_INTEGRATION=1`);
   - no push to `master` outside a release (`PANTIN_RELEASE=1`);
   - the commit message check lets git's own `Merge` and `Revert` headers
     through, as Tunnel's hook does.

   lefthook skips pre-commit jobs when nothing is staged, so commit-msg
   runs the branch guard too, letting a merge in progress through; an empty
   commit on `develop` or `master` is then refused as well. A conflicted
   merge resolved entirely to the current branch's side leaves nothing
   staged, so it passes like a conflict-free merge.

   `git cherry-pick` and `git revert` run neither pre-commit nor commit-msg
   (checked with git 2.47.3), so the hooks do not catch them: do them on
   `develop` only as part of an integration. Tunnel's ADR 0008 says the
   opposite; it is wrong on that point.

   A conflict-free merge (`master` into `develop`, a hotfix into `master`)
   goes through `pre-merge-commit`, which lefthook does not guard, so it is
   not blocked; after a conflict, the final commit needs
   `PANTIN_INTEGRATION=1` on `develop` or `PANTIN_RELEASE=1` on `master`.
   These hooks prevent mistakes, they are not security: an environment
   variable, `--no-verify` or a detached HEAD gets round them. The real
   barrier is branch protection on GitHub, which the user sets on `master`
   and `develop` (no direct push, no force push, green CI required).
9. CI (GitHub Actions) runs `pnpm check` on every pull request and every
   push to `develop` or `master`.

## Rejected alternatives

- GitHub Flow (everything through `master`, always deployable): what we
  had, and it puts unshown work on the public branch.
- Trunk-based development: needs feature flags and a CI culture the project
  does not have yet.
- Merge commits on `develop`: a noisy integration history; the detailed
  commits stay on the work branch while it is reviewed.
- Renaming `master` to `main` to match Tunnel exactly: it changes the
  default branch on GitHub and every existing clone for no gain.

## Consequences

- Start on 2026-10-12: `develop` was created from the local `master`, which
  held the ADR 0039 to 0043 work (21 commits validated by the user's
  demonstration, then phase 6 slices P0 to P1c, each reviewed). P2 was the
  first squash merge. The local `master` went back to `origin/master`; no
  commit was lost, they are all on `develop`.
- Each commit already on `develop` counts as one integrated piece of work.
- CLAUDE.md section 14 points here.
- Until the user protects the branches on GitHub, only the local hooks
  guard them. lefthook reads `lefthook.yml` from the checked-out tree, and
  `master` holds no guard until the first release reaches it: until then a
  `master` checkout is guarded by nothing but GitHub protection. Pushing to
  `master` from a `develop` or work branch checkout is refused.
