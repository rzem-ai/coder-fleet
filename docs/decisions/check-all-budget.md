# The check-all budget and its lock

`claude/evals/lib/check-all.sh` has a budget of 180 seconds for one run on the human's machine with nothing else running. An idle run takes about 86 s on a 16-core machine.

The suite meets that only because its sections run at once and the two hook contracts are sharded. Run one section after another and the suite takes 420 to 480 s. Each section prints its own duration and the run ends with its total, so a slow section names itself.

Running everything at once keeps every core busy, so two runs at the same time starve each other. Two together pushed the load to 58 on 16 cores, ran 3.4 times slower (295 s each) and both failed the board section on its per-test timeouts; one after the other, they pass in about 172 s. Hence the machine-wide lock: a second run waits for the first and says so, a run nested inside a locked one does not wait, and a lock that cannot be taken is reported and the run goes ahead unlocked. `CHECK_ALL_LOCK=0` turns the lock off and `CHECK_ALL_LOCK_WAIT` bounds the wait, 240 s by default.

The lock cannot see load from outside the suite, such as a refuter's mutant copies, so the board tests carry a 60 s per-test timeout. The `TaskCompleted` gate's `CODER_FLEET_TEST_TIMEOUT` is 480 s: a close waits at most 240 s for the lock and can still finish its own run.
