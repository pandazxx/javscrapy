#!/usr/bin/env node

'use strict';
var vo = require('vo');
var Nightmare = require('nightmare');
var cheerio = require('cheerio');
var request = require('superagent');
var async = require('async');
var colors = require('colors');
var program = require('commander');
var ProgressBar = require('progress');
var userHome = require('user-home');
var path = require('path');
var fs = require('fs');

var noop = function noop() {};

// global var
const baseUrl = 'http://www.javbus.in';
//const startUrl = 'http://www.javbus.in/series/3hf';
//const startUrl = 'http://www.javbus.in/series/2x5';
const startUrl = 'http://www.javbus.in/series/2b5';
var pageIndex = 1;
var currentPageHtml = null;

var boostrapUrls = [
    baseUrl + "/uncensored/actresses/%d",
    baseUrl + "/actresses/$d",
]


program
	.version('0.1.0')
	.usage('[options]')
	.option('-p, --parallel <num>', '设置抓取并发连接数，默认值：2', 2)
	.option('-t, --timeout <num>', '自定义连接超时时间(毫秒)。默认值：10000', 10000)
	.option('-l,  --limit <num>', '设置抓取影片的数量上限，0为抓取全部影片。默认值：0', 0)
	.option('-o, --output <path>', '设置磁链抓取结果的保存位置，默认为当前用户的主目录下的magnets.txt文件', path.join(userHome, 'magnets.txt'))
	.parse(process.argv);

var parallel = parseInt(program.parallel);
var timeout = parseInt(program.timeout);
var count = parseInt(program.limit);
var hasLimit = !(count === 0);
var output = program.output.replace(/['"]/g,'');

//if (hasLimit) {
	//debugger;
	//console.log();
	//var progress = new ProgressBar('总进度(:current/:total): [:bar]', {
		//total: parseInt(program.limit),
		//width: 50,
		//incomplete: '-'.gray,
		//complete: '='.bold

	//});
//}

console.log('========== 获取资源站点：%s =========='.green.bold, baseUrl);
console.log('并行连接数：'.green, parallel.toString().green.bold, '      ', '连接超时设置：'.green, (timeout / 1000.0).toString().green.bold,'秒'.green);
console.log('磁链保存位置: '.green, output.green.bold);

/****************************
 *****************************
 **** MAIN LOOP START ! ******
 ****************************
 ****************************/
//async.during(
	//pageExist,
	//// when page exist
	//function(callback) {
		//let pageTasks = [parseLinks, getMagnet];

		//async.waterfall(
			//pageTasks,
			//function(err, result) {
				//pageIndex++;
				//if (err) return callback(err);
				//callback(null);
			//});
	//},
	//// FINALLY
	//function(err) {
		//if (err)
			//return console.log('抓取过程终止：%s', err.message);
		//if (hasLimit && count < 1)
			//console.log('已抓取%s个磁链，本次抓取完毕，等待其他爬虫回家...'.green.bold, program.limit);
	//});

/****************************
 *****************************
 **** MAIN LOOP END ! ******
 ****************************
 ****************************/
var movie_job_queue = async.queue(function(task, callback) {
                                        console.log("Getting magnet from %s".red, task);
                                        getMagnet(task, callback)
                                    },
                                    10)


var index_page_queue = async.queue(function(task, callback) {
    async.retry(3,
               function(callback, result) {
                   console.log("loading %s".green, task);
                   request.get(task)
                          .accept('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
                          .set('Accept-Encoding', 'gzip, deflate')
                          .set('Connection', 'keep-alive')
                          .timeout(timeout)
                          .redirects(4)
                          .end(function(err, res) {
                              if (err) {
                                  return callback(err)
                              }
                              let $ = cheerio.load(res.text)
                              let nextUrl = $("a").filter(function(index) {return $(this).text() === '下一頁'}).attr('href')
                              if (!nextUrl) {
                                  console.log("Cannot get next url for page %s".red.bold, task);
                                  return callback()
                              }
                              if (!nextUrl.toUpperCase().startsWith('HTTP')) {
                                  nextUrl = baseUrl + nextUrl
                              }
                              console.log("Found next page %s".green, nextUrl);
                              index_page_queue.push(nextUrl)
                              parseLinks($)
                              return callback(null, res)
                          })
               },
               function(err, res) {
                   if (err) {
                       return callback(err)
                   }
                   return callback()
               })
})

//movie_job_queue.push("url not exist!")
index_page_queue.push(baseUrl + "/actresses/")
index_page_queue.push(baseUrl + "/uncensored/actresses/")



function parseLinks(c) {
    c('a.movie-box').each(function(i, elem) {
        var movieUrl = c(this).attr('href')
        if (!movieUrl.toUpperCase().startsWith("HTTP")) {
            movieUrl = baseUrl + movieUrl
        }
        console.log("Found movie url: %s".green, movieUrl);
        movie_job_queue.push(movieUrl)
    })
    c('a.avatar-box').each(function(i, elem) {
        var artressUrl = c(this).attr('href')
        if (!artressUrl.toUpperCase().startsWith('HTTP')) {
            artressUrl = baseUrl + artressUrl
        }
        console.log('Found artress: %s'.green, artressUrl);
        index_page_queue.push(artressUrl)
    })
}

//function parseLinks(next) {
	//// console.log(currentPageHtml);
	//let $ = cheerio.load(currentPageHtml);
	//let links = [];
	//$('a.movie-box').each(function(i, elem) {
		//links.push($(this).attr('href'));
	//});
	//let fanhao = [];
	//links.forEach(function(link) {
		//fanhao.push(link.split('/').pop());
	//});
	//console.log('正处理以下番号影片...'.green);
	//console.log(fanhao.toString().yellow)
	//next(null, links);
//}

function getMagnet(link, callback) {

    request
        .get(link)
        .timeout(timeout)
        .end(function(err, res) {
            console.log("处理链接: %s 番号: %s".green, link, link.split('/').pop())
            if (err) {
                console.error('番号%s页面获取失败：%s'.red, link.split('/').pop(), err.message);
                return callback(null);
            }
            let $ = cheerio.load(res.text);
            let script = $('script', 'body').eq(2).html();
            let meta = parse(script);
            var artists = "|"
            $('.star-name > a').each(function(i, link){
                var name = $(this).attr('title')
                var code = $(this).attr('href').split("/").pop()
                artists += name + "(" + code + ")`"
            })
            artists += "|"
            var title = $('h3').text()
            var sensored = $('ul.navbar-nav > li.active > a').text()
            var cover_img = $('div.col-md-9.screencap > a.bigImage > img').attr('src')
            var series = $('span.header').filter(function(index) {return $(this).text().trim() === "系列:"}).siblings('a').text()
            var genre = ""
            $('div.col-md-3.info > p > span.genre >a[href*="genre"]').each(function() {genre += $(this).text() + '`'})
            console.log("Movie info %s: %s".green, link.split('/').pop(), [title, sensored, cover_img, series, genre].join());
            //console.log('fetch link: %S'.blue, link);
            console.log("getting url %s".red, baseUrl + "/ajax/uncledatoolsbyajax.php?gid=" + meta.gid + "&lang=" + meta.lang + "&img=" + meta.img + "&uc=" + meta.uc + "&floor=" + Math.floor(Math.random() * 1e3 + 1));
            request
                .get(baseUrl + "/ajax/uncledatoolsbyajax.php?gid=" + meta.gid + "&lang=" + meta.lang + "&img=" + meta.img + "&uc=" + meta.uc + "&floor=" + Math.floor(Math.random() * 1e3 + 1))
                .set('Referer', 'http://www.javbus.in/SCOP-094')
                .timeout(timeout)
                .end(function(err, res) {
                    debugger;
                    if (err) {
                        console.error('番号%s磁链获取失败: %s'.red, link.split('/').pop(), err.message);
                        return callback(null); // one magnet fetch fail, do not crash the whole task.
                    };
                    let $ = cheerio.load(res.text);
                    let anchor = $('[onclick]').first().attr('onclick');
                    if (anchor) {
                        anchor = /\'(magnet:.+?)\'/g.exec(anchor)[1];
                        var line = [link.split("/").pop(), title, sensored, cover_img, series, title, anchor, genre, artists, '\r\n'].join('|')
                        fs.appendFile(output, line, function(err) {
                            if (err) {
                                throw err;
                                return callback(err);
                            };
                            console.log(anchor.gray);
                        })
                    }
                    return callback(null);
                });
        });

	function parse(script) {
		//console.log(script);
		let gid_r = /gid\s+=\s+(\d+)/g.exec(script);
		let gid = gid_r[1];
		let uc_r = /uc\s+=\s(\d+)/g.exec(script);
		let uc = uc_r[1];
		let img_r = /img\s+=\s+\'(\http:.+\.jpg)/g.exec(script);
		let img = img_r[1];
		return {
			gid: gid,
			img: img,
			uc: uc,
			lang: 'zh'
		};
	}
}



function pageExist(callback) {
	if (hasLimit && count < 2) return callback();
	let url = startUrl + (pageIndex === 1 ? '' : '/page/' + pageIndex);
	// console.log(url);
	console.log('获取第%d页中的影片链接 %s...'.green, pageIndex, url);
	let retryCount = 1;
	async.retry(3,
		function(callback, result) {
			request
				.get(url)
				.accept('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
				.set('Accept-Encoding', 'gzip, deflate')
				.set('Connection', 'keep-alive')
				.timeout(timeout)
				.redirects(2)
				.end(function(err, res) {
					// console.log(res.status)
					if (err) {
						if (err.status === 404) {
							console.error('已抓取完所有页面,StatusCode:', err.status);
							return callback(err);
						} else {
							retryCount++;
							console.error('第%d页页面获取失败：%s'.red, pageIndex, err.message);
							console.error('...进行第%d次尝试...'.red, retryCount);
							return callback(err);
						}
					}
					currentPageHtml = res.text;
					callback(null, res);
				});
		},
		function(err, res) {
			retryCount = 3;
            if(err && err.status === 404){
                return callback(null,false);
            }
			if (err) {
				return callback(err);
			}
			callback(null, res.ok);
		});
}
