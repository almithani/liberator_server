# liberator_server
Random utilities around creating a better way to read books electronically.

This repository is kind of a mess as I haven't spent much time on it.  Don't judge me yet please ;)

# starting a docker server
I'll be using openresty to serve the generated files.  They have a docker image, but I'm a docker newb, so I'm going to stash the commands I need here =p

## basic docker commands
```
docker pull openresty/openresty:stretch-fat
docker image ls
docker container stop openresty
docker container rm openresty
```

## running default nginx configs serving output on my local machine
```
docker run -d -p 80:80 --mount type=bind,source=/Users/almithani/projects/liberator/server/output/,target=/usr/local/openresty/nginx/html  --name openresty openresty/openresty:stretch-fat
```

## running custom nginx.conf
Note the port change in the docker command...the exposed docker port MUST match the port the nginx.conf is serving
```
docker run -d -p 8080:8080 --mount type=bind,source=/Users/almithani/projects/liberator/server/nginx/conf/nginx.conf,target=/usr/local/openresty/nginx/conf/nginx.conf  --name openresty openresty/openresty:stretch-fat
```

## restarting openresty
It's just like nginx:
```
service openresty restart
```