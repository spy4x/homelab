.PHONY: help setup deploy restart logs stop clean backup

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Initial setup - create Docker network
	docker network create proxy || true
	@echo "✅ Docker network 'proxy' created"

deploy: ## Deploy all services
	docker compose up -d
	@echo "✅ Services deployed"

restart: ## Restart all services
	docker compose restart
	@echo "✅ Services restarted"

logs: ## Show logs for all services
	docker compose logs -f --tail=100

stop: ## Stop all services
	docker compose stop
	@echo "⏸️  Services stopped"

clean: ## Stop and remove all containers
	docker compose down
	@echo "🧹 Containers removed"

# Mail server specific commands
mail-user-add: ## Add email user (usage: make mail-user-add EMAIL=user@domain.com)
	@test -n "$(EMAIL)" || (echo "❌ EMAIL not set. Usage: make mail-user-add EMAIL=user@domain.com" && exit 1)
	docker exec -it mailserver setup email add $(EMAIL)
	@echo "✅ User $(EMAIL) added"

mail-user-del: ## Delete email user (usage: make mail-user-del EMAIL=user@domain.com)
	@test -n "$(EMAIL)" || (echo "❌ EMAIL not set. Usage: make mail-user-del EMAIL=user@domain.com" && exit 1)
	docker exec -it mailserver setup email del $(EMAIL)
	@echo "✅ User $(EMAIL) deleted"

mail-user-list: ## List all email users
	docker exec mailserver setup email list
	@echo "✅ User list shown above"

mail-alias-add: ## Add email alias (usage: make mail-alias-add ALIAS=info@domain.com TARGET=user@domain.com)
	@test -n "$(ALIAS)" || (echo "❌ ALIAS not set" && exit 1)
	@test -n "$(TARGET)" || (echo "❌ TARGET not set" && exit 1)
	docker exec -it mailserver setup alias add $(ALIAS) $(TARGET)
	@echo "✅ Alias $(ALIAS) -> $(TARGET) added"

mail-dkim-show: ## Show DKIM public key for DNS
	@echo "📋 Add this TXT record to your DNS:"
	@echo ""
	@echo "Name: mail._domainkey"
	@echo "Type: TXT"
	@echo "Value:"
	@docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/*/mail.txt | grep -v "^;" | tr -d '\n\t "' | sed 's/.*v=DKIM1/v=DKIM1/'
	@echo ""

mail-check-config: ## Check mail server configuration
	docker exec mailserver setup config check
	@echo "✅ Configuration check complete"

mail-debug: ## Show mail server debug info
	docker exec mailserver setup debug

# Status checks
status: ## Show status of all containers
	docker compose ps

health: ## Check health of mail server
	@echo "🏥 Mail server health check:"
	@docker exec mailserver setup debug | grep -i "health\|running\|error" || echo "Mail server is running"
