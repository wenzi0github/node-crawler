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

io.on('connection', function (socket) {
    // socket.emit("system", {"msg":send("连接成功")})
    // 获取简单信息，等待用户确认
    TieBa.socket = socket;
    Analyze.socket = socket;

    socket.on("submit", function(tnum){
        socket.emit("system", {"msg":Analyze.send("正在请求数据...")})
        Analyze.reset();
        TieBa.reset();
        TieBa.getTitle(tnum);
    });

    // 获取内容
    socket.on("content", function(){
        socket.emit("system", {"msg":Analyze.send("正在解析数据...")})
        TieBa.getContent(1);
    })

    socket.on("disconnect", function(){
        socket.emit("system", {"msg":Analyze.send("已与服务器断开连接")})
    })
})

var TieBa = {
    surl : '',
    tnum : 0,
    isMax : true, //是否限制大小
    maxPage : 200,
    pageNum : 0,
    socket : null,

    reset : function(){
        this.maxPage = 200;
    },

    getTitle : function (tnum) {
        var self = this;
        var url = '';
        var arr = tnum.split('/');
        var t_no = 0;

        if(arr.length<5 || (arr[0]!='http:' && arr[0]!='https:') || arr[2]!='tieba.baidu.com' || arr[3]!='p'){
            self.socket.emit("subResult", { 'msg':Analyze.send('请输入正确的贴吧地址!'),  'result':false});
            return;
        }
        if(arr[4].indexOf('?')>-1){
            t_no = arr[4].split('?')[0];
        }else{
            t_no = arr[4];
        }
        url = 'http://tieba.baidu.com/p/'+t_no;
        self.tnum = url;
        Analyze.url = url;

        request(url, function(error, response, body) {
            if(!error && response.statusCode == 200) {
                $ = cheerio.load(body);

                if($('#pb_content').length===0){
                    self.socket.emit("subResult", { 'msg':Analyze.send('帖子不存在或已被删除!'),  'result':false});
                    return false;
                }

                var $pageList = $(".l_posts_num .pager_theme_4 a");
                var $title = $('.core_title_txt');
                var $host = $($('.l_post')[0]);
                var pageNum = $pageList.length ? Analyze.getMaxPage($pageList.last()) : 1;
                var hostinfo = Analyze.getPostField(1, $host);
                self.pageNum = pageNum;
                if(!(pageNum>self.maxPage && self.isMax)){
                    self.maxPage = pageNum;
                }
                var result = {'url':url, 'title':$title.text(), 'name':hostinfo.user_name, 'page':pageNum+ (pageNum>self.maxPage && self.isMax ?'(最多只能请求前'+self.maxPage+'页数据)' : '')}
                self.socket.emit("subResult", { 'msg':Analyze.send('请求成功'),  'result':result});
            }else{
                self.socket.emit("subResult", {"msg":Analyze.send("获取数据失败")})
            }
        });
    },

    getContent : function(page){
        var self = this;
        var url = self.surl + self.tnum;
        request(url+'?pn='+page, function(error, response, body) {
            if(!error && response.statusCode == 200) {
                $ = cheerio.load(body);

                $('.l_post').each(function() {
                    Analyze.addData(Analyze.getPostField(page, $(this)));
                });
                Analyze.percent(page, self.maxPage);
                if(Analyze.per==self.maxPage){
                    Analyze.finish();
                }
            }
        });
        if(page<self.maxPage){
            self.getContent(page+1, self.maxPage);
        }
    }
}

var Analyze = {
    data : [],          // 存储信息
    isRepeat : false,   // 是否计算重复楼层
    norepeat : {},
    users : [],         // 没有重复数据的数组
    per : 0,
    url : '',
    census : {},        // 回复统计
    socket : null,

    // 初始化
    reset : function(){
        this.data = [];          // 存储信息
        this.isRepeat = false;   // 是否计算重复楼层
        this.norepeat = {};
        this.users = [];         // 没有重复数据的数组
        this.per = 0;
        this.census = {};        // 回复统计
    },

    getTime : function(){
        var date = new Date();
        var hour = date.getHours();
        var minute = date.getMinutes();
        var second = date.getSeconds();

        hour = hour<10 ? '0'+hour : hour;
        minute = minute<10 ? '0'+minute : minute;
        second = second<10 ? '0'+second : second;

        return '['+hour+':'+minute+':'+second+'] ';
    },

    send : function(msg){
        return this.getTime()+msg;
    },

    finish : function(){
        var maxdata = this.data.length;
        var maxusers = this.users.length;
        var lottery = this.lottery(maxusers);

        this.socket.emit('system', {'msg':this.getTime()+'已完成'})
        this.socket.emit('finish', {'sum':maxdata, 'real':maxusers, url:Analyze.url, 'user':{'user_id':lottery.user.user_id, 'name':lottery.user.user_name, 'page':lottery.user.page, 'post_index':parseInt(lottery.user.post_index)+1, 'post_no':lottery.user.post_no, 'post_id':lottery.user.post_id, content:lottery.user.content}});
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
        this.socket.emit("progress", {"time":this.getTime(), "page":page, 'count':this.per, 'sum':max});
    },

    // 获取帖子最大的页数
    getMaxPage : function($obj){
        var href = $obj.attr("href");
        var index = href.indexOf("=");
        return href.substr(index+1);
    },

    // 解析每层楼中的数据
    getPostField : function(page, $post){
        var $tail_info = $post.find('.tail-info');
        var tail_info_len = $tail_info.length;
        var field = $post.data('field');
        var author = field.author;
        var content = field.content;

        var user_id = author.user_id;
        var user_name = author.user_name;
        var post_id = content.post_id;
        var post_no = content.post_no;
        var post_index = content.post_index;
        var content = content.content;

        return {'user_id':user_id, 'user_name':user_name, 'page':page, 'post_index':post_index, 'post_no':post_no, 'content':content, 'lasttime':$tail_info.eq(tail_info_len-1).text(), 'post_id':post_id};
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
