#!/bin/bash
cd "$(dirname "$0")"
npx serve dist &
sleep 2
open http://localhost:3000 