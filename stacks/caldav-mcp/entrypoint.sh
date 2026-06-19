#!/bin/sh
set -e

# Ensure dav-mcp is cached by npx, then patch the broken VTODO methods
# (npm-published dav-mcp calls client.createTodo/fetchTodos which don't exist in tsdav;
#  tsdav has createCalendarObject/fetchCalendarObjects instead)
if ! npx -y dav-mcp --help > /dev/null 2>&1; then
  echo "Failed to cache dav-mcp" >&2
fi

# Patch broken dav-mcp VTODO methods (npm publish calls non-existent tsdav methods).
# tsdav has createCalendarObject/fetchCalendarObjects/deleteCalendarObject/updateCalendarObject/calendarMultiGet.
find /root/.npm/_npx -path "*/dav-mcp/src/tools/todos/*.js" -exec sed -i \
  -e 's/client\.createTodo(/client.createCalendarObject(/g' \
  -e 's/client\.fetchTodos(/client.fetchCalendarObjects(/g' \
  -e 's/client\.deleteTodo(/client.deleteCalendarObject(/g' \
  -e 's/client\.updateTodo(/client.updateCalendarObject(/g' \
  -e 's/client\.todoMultiGet(/client.calendarMultiGet(/g' \
  {} + 2>/dev/null

# Now run mcpo with the original command
exec mcpo "$@"
