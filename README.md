# liberator_server
Random utilities around creating a better way to read books electronically.

This repository is kind of a mess as I haven't spent much time on it.  Don't judge me yet please ;)

## Random Dev and deploy notes

* stage files/assets is in the same directory as live files/assets (/usr/local)
    * /usr/local/liberator_stage = staging site
    * /usr/local/liberator_versions = git clones for live site
    * /usr/local/liberator = live site
* the directories above (aka /site_root) are symlinked out all over the place
    * /var/www/books and /var/www/books_stage point to /site_root/output
    * /var/www/liberator_app and /var/www/liberator_app_stage point to /site_root/app
    * nginx confs in /etc/openresty/sites-available/ link to live/stage confs
        * api.conf and files.conf for live
        * stage.x.conf for staging
* so to deploy...
    * copy stage.x.confs over x.confs 
        * make sure to change the servernames and roots (search "root", "server_name", and "/var")
        * git commit and push
    * git clone on live site on server
    * copy stage output -> live output
    * change /site_root/app/js/app.js to point to books.liberator.me instead of stagebooks.liberator.me
    * `service openresty restart`
    * ??? profit ???