-include .env
export $(shell sed 's/=.*//' .env)

# Replace env variables in index.html
build-homepage:
	mkdir -p ./homepage/dist
	envsubst < ./homepage/src/index.html > ./homepage/dist/index.html

deploy:
	make build-homepage
	rsync -avz -e 'ssh' --include-from='deploy.files.txt' --exclude '*' ./ $(SSH_TO_SERVER):$(PATH_APPS)
	ssh homelab "cd $(PATH_APPS) && docker compose up -d"