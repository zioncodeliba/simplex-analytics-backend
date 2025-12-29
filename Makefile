Production: 
	docker compose -f ./docker-compose.yml -f ./docker-compose.prod.yml config > Production.yml

Staging: 
	docker compose -f ./docker-compose.yml -f ./docker-compose.stag.yml config > Staging.yml

ci-testing: 
	docker compose -f ./docker-compose.yml -f ./docker-compose.stag.yml config > ci-testing.yml	
