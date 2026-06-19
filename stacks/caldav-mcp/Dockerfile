FROM ghcr.io/open-webui/mcpo:main

# Pre-install dav-mcp so mcpo doesn't have to wait for npx
RUN npx -y dav-mcp --help > /dev/null 2>&1 || true

# Patch the broken VTODO methods in dav-mcp (npm publish has bug:
# create-todo.js calls client.createTodo() but tsdav only has createCalendarObject)
RUN find /root/.npm/_npx -path "*/dav-mcp/src/tools/todos/*.js" -exec sh -c '
  for f; do
    case "$(basename "$f")" in
      create-todo.js)
        sed -i "s/client\.createTodo(/client.createCalendarObject(/g" "$f"
        echo "Patched $f: createTodo -> createCalendarObject"
        ;;
      list-todos.js)
        sed -i "s/client\.fetchTodos(/client.fetchCalendarObjects(/g" "$f"
        echo "Patched $f: fetchTodos -> fetchCalendarObjects"
        ;;
      todo-query.js)
        sed -i "s/client\.fetchTodos(/client.fetchCalendarObjects(/g" "$f"
        echo "Patched $f: fetchTodos -> fetchCalendarObjects (query)"
        ;;
      todo-multi-get.js)
        sed -i "s/client\.fetchTodos(/client.fetchCalendarObjects(/g" "$f"
        echo "Patched $f: fetchTodos -> fetchCalendarObjects (multi-get)"
        ;;
    esac
  done
' {} +
