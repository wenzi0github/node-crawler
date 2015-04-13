var fs = require("fs");
var request = require("request");
var cheerio = require('cheerio');

var url = 'http://tieba.baidu.com/p/';
var tno = '2632390666'; // 3691211240 2632390666 3692413634
url += tno;

//发送请求
request(url, function(error, response, body) {
    if(!error && response.statusCode == 200) {
        $ = cheerio.load(body);

        var $pageList = $(".l_posts_num .pager_theme_4 a");
        var $title = $('.core_title_txt');
        var $host = $($('.l_post')[0]);
        var pagenum = Analyze.getMaxPage($pageList.last());
        var hostinfo = Analyze.getPostField(1, $host);
        var maxpage = 20;

        console.log('本帖地址： ' + url);
        console.log('本帖名称： ' + $title.text());
        console.log('本帖作者： ' + hostinfo.user_name);
        console.log('最大页码： ' + pagenum);

        if(pagenum>maxpage){
            pagenum = maxpage;
            console.log("最多请求 "+maxpage+" 页数据 ");
        }

        getContent(1, pagenum);
    }
});

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
