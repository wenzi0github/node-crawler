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
        TieBa.getTitle(tnum);
    });

    // 获取内容
    socket.on("content", function(){
        socket.emit("system", {"msg":Analyze.send("正在解析数据...")})
        TieBa.getContent(1);
    })
})

var TieBa = {
    surl : 'http://tieba.baidu.com/p/',
    tnum : 0,
    isMax : false, //是否限制大小
    maxPage : 40,
    pageNum : 0,
    socket : null,

    getTitle : function (tnum) {
        var self = this;
        var url = self.surl + tnum;
        self.tnum = tnum;

        request(url, function(error, response, body) {
            if(!error && response.statusCode == 200) {
                $ = cheerio.load(body);

                var $pageList = $(".l_posts_num .pager_theme_4 a");

                if($pageList.length===0){
                    self.socket.emit("subResult", { 'msg':Analyze.send('帖子不存在或已被删除!'),  'result':false});
                    return false;
                }

                var $title = $('.core_title_txt');
                var $host = $($('.l_post')[0]);
                var pageNum = Analyze.getMaxPage($pageList.last());
                var hostinfo = Analyze.getPostField(1, $host);
                self.pageNum = pageNum;
                if(!self.isMax){
                    self.maxPage = pageNum;
                }
                var result = {'url':url, 'title':$title.text(), 'name':hostinfo.user_name, 'page':pageNum+'(最多只能请求前'+self.maxPage+'页数据)'}
                self.socket.emit("subResult", { 'msg':Analyze.send('请求成功'),  'result':result});
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
    census : {},        // 回复统计
    socket : null,

    send : function(msg){
        var date = new Date();
        var hour = date.getHours();
        var minute = date.getMinutes();
        var second = date.getSeconds();

        hour = hour<10 ? '0'+hour : hour;
        minute = minute<10 ? '0'+minute : minute;
        second = second<10 ? '0'+second : second;

        return '['+hour+':'+minute+':'+second+'] '+msg;
    },

    finish : function(){
        var maxdata = this.data.length;
        var maxusers = this.users.length;
        var lottery = this.lottery(maxusers);

        //console.log("重复回复人数： "+maxdata);
        //console.log("实际回复人数： "+maxusers);
        //console.log("中奖人号码： "+lottery.num);
        //console.log("中奖人信息： ");
        //console.log(lottery.user);
        this.socket.emit("system", {"msg": Analyze.send("重复回复人数： "+maxdata + " 实际回复人数： "+maxusers)});
        this.socket.emit("system", {"msg": Analyze.send("中奖人： 编号："+lottery.user.user_id+' 姓名：'+lottery.user.user_name+' 页码：'+lottery.user.page+' 楼层：'+lottery.user.post_index)});
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
        this.socket.emit("system", {"msg": Analyze.send("已完成：" + page + " , " + this.per + '/' + max )});
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
