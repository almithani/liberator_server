# liberator_server
Random utilities around creating a better way to read books electronically.

This repository is kind of a mess as I haven't spent much time on it.  Don't judge me yet please ;)

# starting a docker server
I'll be using openresty to serve the generated files.  They have a docker image, but I'm a docker newb, so I'm going to stash the commands I need here =p

```
docker pull openresty/openresty:stretch-fat
docker image ls
docker run -d -p 80:80 --mount type=bind,source=/Users/almithani/projects/liberator/server/output/,target=/usr/local/openresty/nginx/html  --name openresty openresty/openresty:stretch-fat
docker container stop openresty
docker container rm openresty
```
