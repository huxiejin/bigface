/**
 * @author huxiejin
 * @description 大花脸比较功能，完成某段文本多个版本差异的比较，并将差异结果在一个界面上显示出来。
 * @keywords compare, merge
 */
(function() {

	function BigFace(contentFieldName) {
		//因为execute接口传入的为json数据，其中json里面包含字符串内容，创建者、操作时间等字段；
		//故需要明确哪个字段为当前需要比较的字段
		//另外，对文章进行版本比较时，既需要比较文档的标题，也需要比较正文内容。
		this.fieldName = contentFieldName || "content";

		//在找到一个多长的匹配串时，则认为两个版本的的位置相匹配
		this.minMatchLength = 30;

		//相比比较内容的百分比，真实的最小匹配长度为：min(content长度*this.minMatchPercent,this.minMatchLength)
		this.minMatchPercent = 0.2;

		//当前比较的两个版本的索引信息
		this.leftIndex = null;
		this.rightIndex = null;
	}

	BigFace.prototype = {

		/**
		 * 对多个版本进行比较，返回比较合并后的结果
		 * @param  {Array} jsonVersions json数组，其中的每个元素结构为：{
					"CRUSER":"huxiejin", //创建者
					"CRTIME":"2016-1-14 15:16:50", //创建时间
					"TITLE" : "THIS IS TITLE",
					"CONTENT":"hello world", //当前版本的数据
					"VERSIONNUM":1 //当前的版本号，需要为一个数字
				}
		 * @return {[type]}              [description]
		 */
		execute: function(jsonVersions) {
			var compareResult, mergeResult;

			for (var i = 0, length = jsonVersions.length - 1; i < length; i++) {
				compareResult = this.compare(jsonVersions[i], jsonVersions[i + 1]);
				mergeResult = this.merge(mergeResult, compareResult);
			}

			return mergeResult;
		},		

		/**
		 * 比较左右两个版本，返回比较结果{left:{},right:{}, ranges:[]},
		 * 其中left,right分别为leftVersion,rightVersion;
		 * ranges为比较后的片段，如：
		 * 1）{sp1:2,ep1:29,sp2:4,ep2:31}表示左侧从索引位2到29的字符串与右侧4到31的字符串区域相等；
		 * 2）{sp1:2,ep1:2,sp2:4,ep2:31}表示右侧字符串索引位从4到31的是新增字符串，并且在左侧索引位2前面新增；
		 * 3）{sp1:2,ep1:29,sp2:4,ep2:4}表示右侧字符串从位置4开始，对左侧索引位从2到29的进行了删除；
		 * @param  {Object} leftVersion  JSON版本数据，其中属性为：
			 * {
					"CRUSER":"huxiejin", //创建者
					"CRTIME":"2016-1-14 15:16:50", //创建时间
					"TITLE" : "THIS IS TITLE",
					"CONTENT":"hello world", //当前版本的数据
					"VERSIONNUM":1 //当前的版本号，需要为一个数字
				}
		 * @param  {Object} rightVersion 同leftVersion数据格式
		 * @return {Object}              返回比较结果{left:{},right:{}, ranges:[]}
		 */
		compare: function(leftVersion, rightVersion) {
			var ranges = [];


			//对左侧字符串进行索引
			if (this.rightIndex) { //直接使用前一次的右侧索引，避免重复计算
				this.leftIndex = this.rightIndex;
			} else {
				var leftIndex = new StringIndex();
				leftIndex.buildIndex(leftVersion[this.fieldName]);
				this.leftIndex = leftIndex;
			}

			//对右侧字符串进行索引
			var rightIndex = new StringIndex();
			rightIndex.buildIndex(rightVersion[this.fieldName]);
			this.rightIndex = rightIndex;

			var leftContent = leftVersion[this.fieldName];
			var len1 = leftContent.length;

			var rightContent = rightVersion[this.fieldName];
			var len2 = rightContent.length;

			var leftPos = 0;
			var rightPos = 0;

			var modifyLeftPos = -1;
			var modifyRightPos = -1;
			while (leftPos < len1 && rightPos < len2) {

				//找到当前左右两个位置匹配的区域片段
				var range = this.findMatchedRange(leftContent, leftPos, rightContent, rightPos);

				if (!range) { //修改模式；左右都找不到，说明左侧内容被删除，同时又添加了新内容
					if (modifyLeftPos == -1) { //记录开始位置
						modifyLeftPos = leftPos;
						modifyRightPos = rightPos;
					}

					leftPos++;
					rightPos++;
					continue;
				}

				if (modifyLeftPos != -1) { //修改模式中的删除
					ranges.push({
						type: '-',
						sp1: modifyLeftPos,
						ep1: leftPos,
						sp2: modifyRightPos,
						ep2: modifyRightPos,
						"CRUSER": rightVersion.CRUSER,
						"CRTIME": rightVersion.CRTIME,
						"VERSIONNUM": rightVersion.VERSIONNUM,
						fragment: leftContent.substring(modifyLeftPos, leftPos)
					});
					modifyLeftPos = -1;
				}

				if (leftPos != range.sp1 && rightPos == range.sp2) { //普通删除
					ranges.push({
						type: '-',
						sp1: leftPos,
						ep1: range.sp1,
						//sp2: rightPos,
						//ep2: rightPos,
						sp2: modifyRightPos != -1 ? modifyRightPos : rightPos,
						ep2: modifyRightPos != -1 ? modifyRightPos : rightPos,
						"CRUSER": rightVersion.CRUSER,
						"CRTIME": rightVersion.CRTIME,
						"VERSIONNUM": rightVersion.VERSIONNUM,
						fragment: leftContent.substring(leftPos, range.sp1)
					});
				}

				if (modifyRightPos != -1) { //修改模式中的新增
					//修复相同的内容先删除后增加
					var fragment = rightContent.substring(modifyRightPos, rightPos);
					var pre = ranges[ranges.length - 1];
					var sameIndex = -1;
					if (pre && pre.type == '-' && pre.fragement == fragment) {
						bsameIndex = ranges.length - 1;
					}
					if (sameIndex == -1) {
						pre = ranges[ranges.length - 2];
						if (pre && pre.type == '-' && pre.fragement == fragment) {
							sameIndex = ranges.length - 2;
						}
					}


					ranges.push({
						type: '+',
						//sp1: leftPos,
						//ep1: leftPos,
						sp1: range.sp1,
						ep1: range.sp1,
						sp2: modifyRightPos,
						ep2: rightPos,
						"CRUSER": rightVersion.CRUSER,
						"CRTIME": rightVersion.CRTIME,
						"VERSIONNUM": rightVersion.VERSIONNUM,
						fragment: fragment
					});
					modifyRightPos = -1;
				}

				if (leftPos == range.sp1 && rightPos != range.sp2) { //普通增加
					ranges.push({
						type: '+',
						sp1: leftPos,
						ep1: leftPos,
						sp2: rightPos,
						ep2: range.sp2,
						"CRUSER": rightVersion.CRUSER,
						"CRTIME": rightVersion.CRTIME,
						"VERSIONNUM": rightVersion.VERSIONNUM,
						fragment: rightContent.substring(rightPos, range.sp2)
					});
				}

				if (leftPos == range.sp1 && rightPos == range.sp2) { //相等
					range.type = '=';
					range.CRUSER = rightVersion.CRUSER;
					range.CRTIME = rightVersion.CRTIME;
					range.VERSIONNUM = rightVersion.VERSIONNUM;
					range.fragment = leftContent.substring(range.sp1, range.ep1);
					ranges.push(range);
					leftPos = range.ep1;
					rightPos = range.ep2;
					continue;
				}

				if (leftPos == range.sp1) { //普通增加的相等处理
					range.type = '=';
					range.CRUSER = rightVersion.CRUSER;
					range.CRTIME = rightVersion.CRTIME;
					range.VERSIONNUM = rightVersion.VERSIONNUM;
					range.fragment = leftContent.substring(leftPos, range.ep1);
					ranges.push(range);
					leftPos = range.ep1;
					rightPos = range.ep2;
					continue;
				}

				if (rightPos == range.sp2) { //普通删除的相等处理
					range.type = '=';
					range.CRUSER = rightVersion.CRUSER;
					range.CRTIME = rightVersion.CRTIME;
					range.VERSIONNUM = rightVersion.VERSIONNUM;
					range.fragment = rightContent.substring(rightPos, range.ep2);
					ranges.push(range);
					leftPos = range.ep1;
					rightPos = range.ep2;
					continue;
				}

				break;
			}

			if (modifyLeftPos != -1) { //修改模式中的删除
				ranges.push({
					type: '-',
					sp1: modifyLeftPos,
					ep1: leftPos,
					sp2: modifyRightPos,
					ep2: modifyRightPos,
					"CRUSER": rightVersion.CRUSER,
					"CRTIME": rightVersion.CRTIME,
					"VERSIONNUM": rightVersion.VERSIONNUM,
					fragment: leftContent.substring(modifyLeftPos, leftPos)
				});
				modifyLeftPos = -1;
			}

			if (leftPos < len1) {
				ranges.push({
					type: '-',
					sp1: leftPos,
					ep1: len1,
					sp2: len2,
					ep2: len2,
					"CRUSER": rightVersion.CRUSER,
					"CRTIME": rightVersion.CRTIME,
					"VERSIONNUM": rightVersion.VERSIONNUM,
					fragment: leftContent.substring(leftPos)
				});
			}

			if (modifyRightPos != -1) { //修改模式中的新增
				ranges.push({
					type: '+',
					sp1: leftPos,
					ep1: leftPos,
					sp2: modifyRightPos,
					ep2: rightPos,
					"CRUSER": rightVersion.CRUSER,
					"CRTIME": rightVersion.CRTIME,
					"VERSIONNUM": rightVersion.VERSIONNUM,
					fragment: rightContent.substring(modifyRightPos, rightPos)
				});
				modifyRightPos = -1;
			}

			if (rightPos < len2) {
				ranges.push({
					type: '+',
					sp1: len1,
					ep1: len1,
					sp2: rightPos,
					ep2: len2,
					"CRUSER": rightVersion.CRUSER,
					"CRTIME": rightVersion.CRTIME,
					"VERSIONNUM": rightVersion.VERSIONNUM,
					fragment: rightContent.substring(rightPos)
				});
			}

			return {
				ranges: ranges,
				left: leftVersion,
				right: rightVersion
			};
		},

		/**
		 * 左侧leftContent从指定的位置leftPos，右侧rightContent从指定的位置rightPos开始找到一个匹配串
		 * 此方法优先从左侧开始取串从右侧查找，没有找到的情况下，再反向查找。
		 * @param  {[type]} leftContent  [description]
		 * @param  {[type]} leftPos      [description]
		 * @param  {[type]} rightContent [description]
		 * @param  {[type]} rightPos     [description]
		 * @return {[type]}              [description]
		 */
		findMatchedRange: function(leftContent, leftPos, rightContent, rightPos) {
			//从左侧取一个字符，去右边的内容中进行查找
			var range = this.findAvailableRange(leftContent, leftPos, rightContent, rightPos, this.rightIndex);
			if (range) {
				return range;
			}

			//从右侧取一个字符，去左边的内容中进行查找，参数调换位置，这样可以调用同一个接口
			range = this.findAvailableRange(rightContent, rightPos, leftContent, leftPos, this.leftIndex);
			if (range) {
				return {
					sp1: range.sp2,
					ep1: range.ep2,
					sp2: range.sp1,
					ep2: range.ep1
				}
			}

			range = this.findEqualRange(leftContent, leftPos, rightContent, rightPos);

			if(range.sp1 != range.ep1){//相等但长度没有得到指标
				return range;
			}

			return null;
		},

		/**
		 * 从左侧leftContent从指定的位置leftPos，在右侧rightContent从指定的位置rightPos开始找到一个匹配串
		 * @param  {[type]} leftContent  [description]
		 * @param  {[type]} leftPos      [description]
		 * @param  {[type]} rightContent [description]
		 * @param  {[type]} rightPos     [description]
		 * @param  {[type]} stringIndex  [description]
		 * @return {[type]}              [description]
		 */
		findAvailableRange: function(leftContent, leftPos, rightContent, rightPos, stringIndex) {
			var tmpChar = leftContent[leftPos];
			var rightIndexItem = stringIndex.charValueIndex[tmpChar];

			//右边不存在该字符，则肯定找不到，直接退出
			if (!rightIndexItem) {
				return null;
			}

			//兼容更短内容的版本比较，如：对标题进行比较，标题一般10-20个字
			//故每次比较的最小长度为当前长度的一个比例与设定的最小长度中更小值
			var minMatchLength = Math.floor((leftContent.length - leftPos) * this.minMatchPercent);
			minMatchLength = Math.max(Math.min(minMatchLength, this.minMatchLength), 1);

			var rightPoss = rightIndexItem.index;
			for (var i = 0, length = rightPoss.length; i < length; i++) {
				if (rightPoss[i] < rightPos) { //排除之前已经处理过的内容
					continue;
				}

				var range = this.findEqualRange(leftContent, leftPos, rightContent, rightPoss[i]);

				if (range.ep1 - range.sp1 > minMatchLength) {
					//console.log("match left find...,sp1:" + range.sp1 + ";ep1:" + range.ep1 + ";sp2:" + range.sp2 + ";ep2:" + range.ep2);
					return range;
				}
			}

			return null;
		},

		/**
		 * 从指定的位置开始，发现相等的区域
		 * @param  {[type]} leftContent  [description]
		 * @param  {[type]} leftPos      [description]
		 * @param  {[type]} rightContent [description]
		 * @param  {[type]} rightPos     [description]
		 * @return {[type]}              [description]
		 */
		findEqualRange: function(leftContent, leftPos, rightContent, rightPos) {
			var len1 = leftContent.length;
			var len2 = rightContent.length;

			var result = {};

			//next direction
			var ep1 = leftPos,
				ep2 = rightPos;
			while (ep1 < len1 && ep2 < len2) {
				if (leftContent[ep1] != rightContent[ep2]) {
					break;
				}
				ep1++;
				ep2++;
			}

			return {
				sp1: leftPos,
				ep1: ep1,
				sp2: rightPos,
				ep2: ep2
			};
		},

		initMergeResult: function(compareResult) {
			var mergeResult = [];
			var leftVersion = compareResult.left;
			var rightVersion = compareResult.right;
			var compareRanges = compareResult.ranges;

			for (var i = 0, length = compareRanges.length; i < length; i++) {
				var compareRange = compareRanges[i];
				var versionObj = compareRange.type == '+' ? rightVersion : leftVersion;
				var itemRange = extend({}, compareRange, {
					"VERSIONNUM": versionObj.VERSIONNUM,
					"lv": rightVersion.VERSIONNUM //最近的版本lastversion					
				});

				mergeResult.push(itemRange);
			}

			return mergeResult;
		},

		merge: function(mergeResult, compareResult) {
			//第一个版本比较结果，直接从compareResult获取merge结果
			if (!mergeResult) {
				return this.initMergeResult(compareResult);
			}

			this.mergeIndex = 0;
			var compareRanges = compareResult.ranges;
			for (var i = 0; i < compareRanges.length; i++) {
				this.mergeRange(mergeResult, compareResult, i);
			}

			return mergeResult;
		},

		mergeRange: function(mergeResult, compareResult, compareIndex) {
			var compareRange = compareResult.ranges[compareIndex];

			//find mergeIndex
			//存在修改模式的情况，而此时比较的索引位不变。
			var mergeIndex = this.mergeIndex || 0;

			for (; mergeIndex < mergeResult.length; mergeIndex++) {

				var mergeRange = mergeResult[mergeIndex];

				//删除的内容，对后面的版本不可见，故可以直接忽略
				if (mergeRange.type == '-') {
					continue;
				}

				//非相邻版本，可以直接忽略，compareRange仅和相邻的前一个版本进行比较
				if (compareRange.VERSIONNUM - mergeRange.lv != 1) {
					continue;
				}

				if (mergeRange.sp2 == compareRange.sp1) {
					break;
				}
			}

			this.mergeIndex = mergeIndex;
			if (mergeIndex >= mergeResult.length) {
				mergeResult.push(extend({}, compareRange, {
					"lv": compareRange.VERSIONNUM //最近的版本lastversion
				}));
				return;
			}

			var method = mergeResult[mergeIndex].type + compareRange.type;
			this.mergeRangeImpl[method].call(this, mergeResult, mergeIndex, compareResult, compareIndex);
		},

		mergeRangeImpl: {
			'==': function(mergeResult, mergeIndex, compareResult, compareIndex) {
				var mergeRange = mergeResult[mergeIndex];
				var compareRange = compareResult.ranges[compareIndex];
				var mep2 = mergeRange.ep2;
				var cep1 = compareRange.ep1;
				if (mep2 > cep1) {
					var range1 = extend({}, compareRange, {
						"CRUSER": mergeRange.CRUSER,
						"VERSIONNUM": mergeRange.VERSIONNUM,
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});
					mergeResult.splice(mergeIndex, 1, range1);

					var length = compareRange.fragment.length;
					var fragment = mergeRange.fragment.substr(length);
					var range2 = extend({}, mergeRange, {
						"sp1": mergeRange.ep1 - fragment.length,
						"sp2": mergeRange.ep2 - fragment.length,
						"fragment": fragment
					});
					mergeResult.splice(mergeIndex + 1, 0, range2);
				} else {
					var length = mergeRange.fragment.length;

					var range1 = extend({}, compareRange, {
						"CRUSER": mergeRange.CRUSER,
						"VERSIONNUM": mergeRange.VERSIONNUM,
						"ep1": compareRange.sp1 + length,
						"ep2": compareRange.sp2 + length,
						"fragment": compareRange.fragment.substr(0, length),
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});
					mergeResult.splice(mergeIndex, 1, range1);
					compareResult.ranges.splice(compareIndex, 1, extend({}, range1));

					var range2 = extend({}, compareRange, {
						"sp1": range1.ep1,
						"sp2": range1.ep2,
						"fragment": compareRange.fragment.substr(length)
					});

					if (range2.fragment.length > 0) {
						compareResult.ranges.splice(compareIndex + 1, 0, range2);
					}
				}
			},
			'=+': function(mergeResult, mergeIndex, compareResult, compareIndex) {
				var mergeRange = mergeResult[mergeIndex];
				var compareRange = compareResult.ranges[compareIndex];
				var range = extend({}, compareRange, {
					"lv": compareRange.VERSIONNUM //最近的版本lastversion
				});
				mergeResult.splice(mergeIndex, 0, range);
			},
			'=-': function(mergeResult, mergeIndex, compareResult, compareIndex) {
				var mergeRange = mergeResult[mergeIndex];
				var compareRange = compareResult.ranges[compareIndex];
				var mep2 = mergeRange.ep2;
				var cep1 = compareRange.ep1;
				if (mep2 > cep1) {
					var length = compareRange.fragment.length;
					var offset = 0;
					if (mergeRange.VERSIONNUM != 1) { //非初始版本
						var range = extend({}, mergeRange, {
							"ep1": mergeRange.sp1 + length,
							"ep2": mergeRange.sp2 + length,
							"fragment": compareRange.fragment
						});
						offset++;
						mergeResult.splice(mergeIndex, 0, range);
					}

					var range1 = extend({}, compareRange, {
						"VERSIONNUM": mergeRange.VERSIONNUM,
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});

					var fragment = mergeRange.fragment.substr(length);
					var range2 = extend({}, mergeRange, {
						"sp1": mergeRange.ep1 - fragment.length,
						"sp2": mergeRange.ep2 - fragment.length,
						"fragment": fragment
					});

					mergeResult.splice(mergeIndex + offset, 1, range1, range2);
				} else {
					var length = mergeRange.fragment.length;

					var range1 = extend({}, compareRange, {
						"ep1": compareRange.sp1 + length,
						"ep2": compareRange.sp2,
						"fragment": mergeRange.fragment,
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});
					mergeResult.splice(mergeIndex, 1, range1);
					compareResult.ranges.splice(compareIndex, 1, extend({}, range1));

					var range2 = extend({}, compareRange, {
						"sp1": range1.ep1,
						"sp2": range1.ep2,
						"fragment": compareRange.fragment.substr(length),
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});

					if (range2.fragment.length > 0) {
						compareResult.ranges.splice(compareIndex + 1, 0, range2);
					}
				}
			},
			'+=': function(mergeResult, mergeIndex, compareResult, compareIndex) {
				var mergeRange = mergeResult[mergeIndex];
				var compareRange = compareResult.ranges[compareIndex];
				var mep2 = mergeRange.ep2;
				var cep1 = compareRange.ep1;
				if (mep2 > cep1) {

					var range1 = extend({}, compareRange, {
						"type": '+',
						"ep1": compareRange.sp1,
						"CRUSER": mergeRange.CRUSER,
						"VERSIONNUM": mergeRange.VERSIONNUM,
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});

					var length = compareRange.fragment.length;
					var fragment = mergeRange.fragment.substr(length);
					var range2 = extend({}, mergeRange, {
						"sp2": mergeRange.ep2 - fragment.length,
						"fragment": fragment
					});

					mergeResult.splice(mergeIndex, 1, range1, range2);
				} else {
					var length = mergeRange.fragment.length;

					var range1 = extend({}, compareRange, {
						"type": "+",
						"CRUSER": mergeRange.CRUSER,
						"VERSIONNUM": mergeRange.VERSIONNUM,
						"ep1": compareRange.sp1,
						"ep2": compareRange.sp2 + length,
						"fragment": mergeRange.fragment,
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});
					mergeResult.splice(mergeIndex, 1, range1);
					compareResult.ranges.splice(compareIndex, 1, extend({}, range1));

					var fragment = compareRange.fragment.substr(length);
					var range2 = extend({}, compareRange, {
						"sp1": compareRange.ep1 - fragment.length,
						"sp2": compareRange.ep2 - fragment.length,
						"fragment": fragment
					});

					if (range2.fragment.length > 0) {
						compareResult.ranges.splice(compareIndex + 1, 0, range2);
					}
				}
			},
			'++': function(mergeResult, mergeIndex, compareResult, compareIndex) {
				var mergeRange = mergeResult[mergeIndex];
				var compareRange = compareResult.ranges[compareIndex];
				var range = extend({}, compareRange, {
					"lv": compareRange.VERSIONNUM //最近的版本lastversion
				});
				mergeResult.splice(mergeIndex, 0, range);
			},
			'+-': function(mergeResult, mergeIndex, compareResult, compareIndex) {
				var mergeRange = mergeResult[mergeIndex];
				var compareRange = compareResult.ranges[compareIndex];
				var mep2 = mergeRange.ep2;
				var cep1 = compareRange.ep1;
				if (mep2 > cep1) {
					var length = compareRange.fragment.length;

					var range = extend({}, mergeRange, {
						"ep1": mergeRange.sp1 + length,
						"ep2": mergeRange.sp2 + length,
						"fragment": compareRange.fragment
					});

					mergeResult.splice(mergeIndex, 0, range);

					var range1 = extend({}, compareRange, {
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});

					var fragment = mergeRange.fragment.substr(length);
					var range2 = extend({}, mergeRange, {
						"CRUSER": mergeRange.CRUSER,
						"VERSIONNUM": mergeRange.VERSIONNUM,
						"sp1": mergeRange.ep1,
						"sp2": mergeRange.ep2 - fragment.length,
						"fragment": fragment
					});

					mergeResult.splice(mergeIndex + 1, 1, range1, range2);
				} else {
					var length = mergeRange.fragment.length;

					var range1 = extend({}, compareRange, {
						"ep1": compareRange.sp1 + length,
						"ep2": compareRange.sp2,
						"fragment": mergeRange.fragment,
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});
					mergeResult.splice(mergeIndex + 1, 0, range1);
					compareResult.ranges.splice(compareIndex, 1, extend({}, range1));

					var range2 = extend({}, compareRange, {
						"sp1": range1.ep1,
						"sp2": range1.ep2,
						"fragment": compareRange.fragment.substr(length),
						"lv": compareRange.VERSIONNUM //最近的版本lastversion
					});

					if (range2.fragment.length > 0) {
						compareResult.ranges.splice(compareIndex + 1, 0, range2);
					}
				}
			}
		}
	};

	//util
	function extend(dst, src) {
		if (arguments.length > 2) {
			for (var index = 1, length = arguments.length; index < length; index++) {
				extend(dst, arguments[index]);
			}
			return dst;
		}

		for (var key in src) {
			dst[key] = src[key];
		}
		return dst;
	}

	/**
	 * 字符串索引类
	 */
	StringIndex = function() {
		this.charValueIndex = {};
		this.sortedCharValue = [];
	}

	StringIndex.prototype = {
		/**
		 * 构建字符串content的索引
		 * @param  {[type]} content [description]
		 * @return {[type]}         [description]
		 */
		buildIndex: function(content) {
			var charValueIndex = this.charValueIndex = {}; //{char1:{show:5, pos:10, index:[index1, index2....]},...}
			var sortedCharValue = this.sortedCharValue = []; //[char1,char2,...]

			for (var i = 0, length = content.length; i < length; i++) {
				var value = content[i];
				var item = charValueIndex[value];

				if (!item) {
					item = {
						show: 1,
						pos: sortedCharValue.length,
						index: [i]
					};
					charValueIndex[value] = item;
					sortedCharValue.push(value);
					continue;
				}

				item.show = item.show + 1;
				item.index.push(i);

				this.reLocate(item.pos);
			}
		},

		reLocate: function(pos) {
			//current
			var charValueIndex = this.charValueIndex;
			var sortedCharValue = this.sortedCharValue;
			var value = sortedCharValue[pos];
			var item = charValueIndex[value];

			while (pos > 0) {
				pos--;
				var preValue = sortedCharValue[pos];
				var preItem = charValueIndex[preValue];

				if (preItem.show >= item.show) {
					break;
				}

				//swap
				sortedCharValue[pos] = value;
				sortedCharValue[pos + 1] = preValue;

				preItem.pos = pos + 1;
				item.pos = pos;
			}
		}
	};

	var trs = window.trs = window.trs || {};
	trs.BigFace = BigFace;
	trs.StringIndex = StringIndex;

})(window);
