.PHONY: *
-include .env
export $(shell sed 's/=.*//' .env)

# Replace env variables in index.html
build-homepage:
	mkdir -p ./homepage/dist
	envsubst < ./homepage/src/index.html > ./homepage/dist/index.html
	cp ./homepage/src/sw.js ./homepage/dist/
	cp ./homepage/src/manifest.json ./homepage/dist/
	cp -r ./homepage/src/assets ./homepage/dist/

# Copy files to server
copy-files:
	rsync -avhzru -P -e ssh --include-from='deploy.files.txt' --exclude '*' ./ $(SSH_TO_SERVER):$(PATH_APPS)

# Create proxy network (so reverse proxy can access other containers), if it doesn't exist yet
create-proxy-network:
	ssh $(SSH_TO_SERVER) "docker network create proxy 2>/dev/null || true"

# Deploy main homelab services
up-homelab:
	ssh $(SSH_TO_SERVER) "cd $(PATH_APPS) && docker compose up -d"

# Deploy Immich
up-immich:
	ssh $(SSH_TO_SERVER) "cd $(PATH_APPS)/immich && docker compose --env-file=.env --env-file=../.env up -d"

deploy:
	make build-homepage
	make copy-files
	make create-proxy-network
	make up-homelab
	make up-immich
