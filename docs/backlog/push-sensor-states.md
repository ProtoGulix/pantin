# Push sensor states instead of polling

The viewer polls tags every 250 ms for sensor markers and presence beams
(ADR 0024 points 4 and 5). A cell crossed by a fast product can switch on and
off between two polls and never show. Pushing tag changes on the stream
would fix it.
