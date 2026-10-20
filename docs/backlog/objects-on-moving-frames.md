# Guides on moving frames

Phase: conveying and physics (after phase 6). ADR: 0043 point 1 and 4.

Since 2026-10-13 a phase 6 object follows its body or the joints anchoring
its assembly (ADR 0043 point 1). Belts carried by a moving frame add the
frame's velocity (linear and angular, from two consecutive poses of the fixed
step) to their surface velocity, so a box rides a shuttle or a lift. A joint
that jumps between two steps (a position written directly) gives one step of
huge velocity: not guarded. The same happens when the physics world is rebuilt
after an edit of a belt or guide during a run: it is built at the reference
poses while the joints stay put (`service/physics-runtime.ts`). Open idea: a
clamp or jump threshold on the frame velocity.

Guide colliders on moving frames are kinematic position-based bodies, so the
engine derives their velocity, but this is NOT VERIFIED by a test (pushing a
box sideways with a moving guide).
