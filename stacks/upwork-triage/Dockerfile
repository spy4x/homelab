FROM denoland/deno:alpine

WORKDIR /app

COPY deno.jsonc ./
COPY types.ts evaluator.ts notifier.ts +main.ts ./

RUN deno cache +main.ts

COPY prompt.txt ./

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "+main.ts"]
