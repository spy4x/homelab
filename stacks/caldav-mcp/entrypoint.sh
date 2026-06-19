#!/bin/sh
set -e

# Ensure dav-mcp is cached by npx, then patch the broken VTODO methods
# (npm-published dav-mcp calls client.createTodo/fetchTodos which don't exist in tsdav;
#  tsdav has createCalendarObject/fetchCalendarObjects instead)
if ! npx -y dav-mcp --help > /dev/null 2>&1; then
  echo "Failed to cache dav-mcp" >&2
fi

# Patch broken dav-mcp VTODO methods (npm publish calls non-existent tsdav methods).
# tsdav has createCalendarObject/fetchCalendarObjects (defaults to VEVENT),
# deleteCalendarObject, updateCalendarObject, calendarMultiGet.
# For fetchTodos, we must add VTODO filter since fetchCalendarObjects defaults to VEVENT.
find /root/.npm/_npx -path "*/dav-mcp/src/tools/todos/*.js" -exec sed -i \
  -e 's/client\.createTodo(/client.createCalendarObject(/g' \
  -e 's/client\.deleteTodo(/client.deleteCalendarObject(/g' \
  -e 's/client\.updateTodo(/client.updateCalendarObject(/g' \
  -e 's/client\.todoMultiGet(/client.calendarMultiGet(/g' \
  {} + 2>/dev/null

# For fetchTodos → fetchCalendarObjects, need to add VTODO filter since the default is VEVENT
# list-todos.js:  const todos = await client.fetchCalendarObjects({ calendar });
# todo-query.js:  const calendarTodos = await client.fetchCalendarObjects({ calendar });
# Insert a VTODO filter constant and modify the calls
VTODO_FILTER='[{"comp-filter":{"_attributes":{"name":"VCALENDAR"},"comp-filter":{"_attributes":{"name":"VTODO"}}}}]'
find /root/.npm/_npx -path "*/dav-mcp/src/tools/todos/list-todos.js" -exec sed -i \
  -e 's/client\.fetchTodos(/client.fetchCalendarObjects(/g' \
  -e 's/const todos = await client\.fetchCalendarObjects({ calendar })/'"const todoFilter = $VTODO_FILTER; const todos = await client.fetchCalendarObjects({ calendar, filters: todoFilter })"'/g' \
  {} + 2>/dev/null
find /root/.npm/_npx -path "*/dav-mcp/src/tools/todos/todo-query.js" -exec sed -i \
  -e 's/client\.fetchTodos(/client.fetchCalendarObjects(/g' \
  -e 's/const calendarTodos = await client\.fetchCalendarObjects({ calendar })/'"const calendarTodos = await client.fetchCalendarObjects({ calendar, filters: $VTODO_FILTER })"'/g' \
  {} + 2>/dev/null

# Now run mcpo with the original command
exec mcpo "$@"
