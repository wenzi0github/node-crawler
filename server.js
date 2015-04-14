var express = require('express'); //引入express模块
var request = require("request");
var cheerio = require('cheerio');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var port = 3000;

app.use('/', express.static(__dirname + '/www')); //指定静态HTML文件的位置
server.listen(port);

console.log("已监听"+port+"端口，系统正在运行...");

var surl = 'http://tieba.baidu.com/p/';
var tno = '2632390666'; // 3691211240 2632390666 3692413634

io.on('connection', function (socket) {
    socket.emit("system", "login")
    socket.on("submit", function(tnum){
        var url = surl + tnum;
        console.log(url);
        request(url, function(error, response, body) {
            if(!error && response.statusCode == 200) {
                $ = cheerio.load(body);

                var $pageList = $(".l_posts_num .pager_theme_4 a");
                var $title = $('.core_title_txt');
                var $host = $($('.l_post')[0]);
                var pagenum = Analyze.getMaxPage($pageList.last());
                var hostinfo = Analyze.getPostField(1, $host);
                var ismax = false; // 是否限制大小
                var maxpage = 20;

                var result = {'url':url, 'title':$title.text(), 'name':hostinfo.user_name, 'page':pagenum}
                socket.emit("subResult", result);
            }
        });
    })
})

//发送请求
function getTitle(tnum){
    url += tnum;
    console.log(url);
    request(url, function(error, response, body) {
        if(!error && response.statusCode == 200) {
            $ = cheerio.load(body);

            var $pageList = $(".l_posts_num .pager_theme_4 a");
            var $title = $('.core_title_txt');
            var $host = $($('.l_post')[0]);
            var pagenum = Analyze.getMaxPage($pageList.last());
            var hostinfo = Analyze.getPostField(1, $host);
            var ismax = false; // 是否限制大小
            var maxpage = 20;

            /* console.log('本帖地址： ' + url);
            console.log('本帖名称： ' + $title.text());
            console.log('本帖作者： ' + hostinfo.user_name);
            console.log('最大页码： ' + pagenum);

            if(ismax && pagenum>maxpage){
                pagenum = maxpage;
                console.log("最多请求 "+maxpage+" 页数据 ");
            }

            getContent(1, pagenum); */
            var result = {'url':url, 'name':$title.text(), 'user_name':hostinfo.user_name, 'pagenum':pagenum}
            socket.emit("subResult", result);
        }
    });
}

function getContent (page, max){
    var curpage = page || 1;
    request(url+'?pn='+page, function(error, response, body) {
        if(!error && response.statusCode == 200) {
            $ = cheerio.load(body);

            $('.l_post').each(function() {
                Analyze.addData(Analyze.getPostField(page, $(this)));
            });
            Analyze.percent(page, max);
            if(Analyze.per==max){
                Analyze.finish();
            }
        }
    });
    if(page<max){
        getContent(page+1, max);
    }
}

var Analyze = {
    data : [],          // 存储信息
    isRepeat : false,   // 是否计算重复楼层
    norepeat : {},
    users : [],         // 没有重复数据的数组
    per : 0,
    census : {},        // 回复统计

    finish : function(){
        var maxdata = this.data.length;
        var maxusers = this.users.length;
        var lottery = this.lottery(maxusers);

        console.log("重复回复人数： "+maxdata);
        console.log("实际回复人数： "+maxusers);
        console.log("中奖人号码： "+lottery.num);
        console.log("中奖人信息： ");
        console.log(lottery.user);
    },

    lottery : function(max){
        var num = parseInt(Math.random()*max);
        return {'num':num, 'user':this.users[num]}
    },

    write : function(){
        var users = this.users;
        var html = "";

        for(var key in users){
            html += users[key].page + '-' + users[key].post_index + ': ' + users[key].user_id + ' , ' + users[key].user_name + "\n";
        }

        fs.writeFile("./data.txt", html, "utf8", function(err){
            if(!err){
                console.log("写入完成");
            }
        })
    },

    percent : function(page, max){
        this.per++;
        page = page<10 ? '0'+page : page;
        console.log((new Date()).getTime()+" 已完成：" + page + " , " + this.per + '/' + max );
    },

    // 获取帖子最大的页数
    getMaxPage : function($obj){
        var href = $obj.attr("href");
        var index = href.indexOf("=");
        return href.substr(index+1);
    },

    // 解析每层楼中的数据
    getPostField : function(page, $post){
        var field = $post.data('field');
        var author = field.author;
        var content = field.content;

        var user_id = author.user_id;
        var user_name = author.user_name;
        var post_index = content.post_index;

        return {'user_id':user_id, 'user_name':user_name, 'page':page, 'post_index':post_index};
    },

    // 将解析后的数据添加到数组中
    addData : function(field){
        this.data.push(field);

        // 查询楼主所在的楼层
        if(typeof this.census['k'+field.user_id] === "undefined"){
            this.census['k'+field.user_id] = {'user_name':field.user_name, 'count':1};
        }else{
            var num = parseInt(this.census['k'+field.user_id].count);
            this.census['k'+field.user_id].count = num+1;
        }

        // 去除重复元素
        if(typeof this.norepeat['k'+field.user_id] === "undefined"){
            this.users.push(field);
            this.norepeat['k'+field.user_id] = "v";
        }
    }
}
