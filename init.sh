#!/bin/bash

# Run chrome with CDP enabled.
nohup google-chrome --remote-debugging-address=0.0.0.0 \
--remote-debugging-port=9222 \
--user-data-dir=./user-data/ \
--profile-directory=Default &
