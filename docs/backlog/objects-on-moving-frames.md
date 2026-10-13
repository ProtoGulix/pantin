# Guides and belts on moving frames

Since 2026-10-13 a phase 6 object follows its body or the joints anchoring
its assembly (ADR 0043 point 1). A belt is teleported to its frame pose each
step and its velocity is the surface velocity only (point 3), so a belt
carried sideways (shuttle, transfer carriage) slides under the box instead
of carrying it; a lift works because the solver pushes the box up (P1c and
moving-frame tests). Adding the frame velocity to the belt and guide bodies
would fix it. Guide colliders on moving frames are NOT VERIFIED.
