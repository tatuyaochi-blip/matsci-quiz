// XRD 解析ワークベンチ。4つのモード:
//  sim   回折パターンのシミュレーション(構造・格子定数・波長から、全反射の位置と相対強度)
//  index 指数づけ(測った 2θ から立方晶の構造を判定し、(hkl) をつけ、格子定数を最小二乗・Nelson–Riley で求める)
//  size  結晶子の大きさとひずみ(シェラーの式、Williamson–Hall プロット)
//  shift ピークの移動(Δa/a ↔ Δ2θ、等二軸応力の目安、ベガード則での組成)
// 式: ブラッグの法則 λ = 2d sinθ。立方晶 1/d² = (h²+k²+l²)/a²、六方晶 1/d² = 4(h²+hk+k²)/(3a²) + l²/c²。
//   構造因子 F = Σ f_j exp(2πi(hx_j + ky_j + lz_j))、f_j = (f0(s) + f′ + i f″)·exp(−B s²)、s = sinθ/λ。
//   粉末の積分強度 I ∝ Σ|F|²(同じ d の反射の和 = 多重度 × |F|²)× LP、LP = (1 + cos²2θ)/(sin²θ cosθ)
//   (回折側のモノクロメーターがあるときは (1 + cos²2θm cos²2θ)/((1 + cos²2θm) sin²θ cosθ))。
//   試料は十分に厚い平板(ブラッグ–ブレンターノ、吸収の補正は角度によらない)、配向なし、消衰なしとする。
// 値の出典は review の xrd-deep/sources.md。データの塊は scripts/make_data.py が作る。
import { num } from './eng.js';
import { EL } from './ptable.js';

// <data> scripts/make_data.py が作る(手で直さない)
// 原子散乱因子 f0(s) = a1·e^(−b1 s²) + … + a4·e^(−b4 s²) + c(s = sinθ/λ, Å⁻¹)。ITC Vol. C (1992) Table 6.1.1.4。並びは a1 b1 a2 b2 a3 b3 a4 b4 c
export const F0 = {"H":[0.493002,10.5109,0.322912,26.1257,0.140191,3.14236,0.04081,57.7997,0.003038],"He":[0.8734,9.1037,0.6309,3.3568,0.3112,22.9276,0.178,0.9821,0.0064],"Li":[1.1282,3.9546,0.7508,1.0524,0.6175,85.3905,0.4653,168.261,0.0377],"Be":[1.5919,43.6427,1.1278,1.8623,0.5391,103.483,0.7029,0.542,0.0385],"B":[2.0545,23.2185,1.3326,1.021,1.0979,60.3498,0.7068,0.1403,-0.1932],"C":[2.31,20.8439,1.02,10.2075,1.5886,0.5687,0.865,51.6512,0.2156],"N":[12.2126,0.0057,3.1322,9.8933,2.0125,28.9975,1.1663,0.5826,-11.529],"O":[3.0485,13.2771,2.2868,5.7011,1.5463,0.3239,0.867,32.9089,0.2508],"F":[3.5392,10.2825,2.6412,4.2944,1.517,0.2615,1.0243,26.1476,0.2776],"Ne":[3.9553,8.4042,3.1125,3.4262,1.4546,0.2306,1.1251,21.7184,0.3515],"Na":[4.7626,3.285,3.1736,8.8422,1.2674,0.3136,1.1128,129.424,0.676],"Mg":[5.4204,2.8275,2.1735,79.2611,1.2269,0.3808,2.3073,7.1937,0.8584],"Al":[6.4202,3.0387,1.9002,0.7426,1.5936,31.5472,1.9646,85.0886,1.1151],"Si":[6.2915,2.4386,3.0353,32.3337,1.9891,0.6785,1.541,81.6937,1.1407],"P":[6.4345,1.9067,4.1791,27.157,1.78,0.526,1.4908,68.1645,1.1149],"S":[6.9053,1.4679,5.2034,22.2151,1.4379,0.2536,1.5863,56.172,0.8669],"Cl":[11.4604,0.0104,7.1964,1.1662,6.2556,18.5194,1.6455,47.7784,-9.5574],"Ar":[7.4845,0.9072,6.7723,14.8407,0.6539,43.8983,1.6442,33.3929,1.4445],"K":[8.2186,12.7949,7.4398,0.7748,1.0519,213.187,0.8659,41.6841,1.4228],"Ca":[8.6266,10.4421,7.3873,0.6599,1.5899,85.7484,1.0211,178.437,1.3751],"Sc":[9.189,9.0213,7.3679,0.5729,1.6409,136.108,1.468,51.3531,1.3329],"Ti":[9.7595,7.8508,7.3558,0.5,1.6991,35.6338,1.9021,116.105,1.2807],"V":[10.2971,6.8657,7.3511,0.4385,2.0703,26.8938,2.0571,102.478,1.2199],"Cr":[10.6406,6.1038,7.3537,0.392,3.324,20.2626,1.4922,98.7399,1.1832],"Mn":[11.2819,5.3409,7.3573,0.3432,3.0193,17.8674,2.2441,83.7543,1.0896],"Fe":[11.7695,4.7611,7.3573,0.3072,3.5222,15.3535,2.3045,76.8805,1.0369],"Co":[12.2841,4.2791,7.3409,0.2784,4.0034,13.5359,2.3488,71.1692,1.0118],"Ni":[12.8376,3.8785,7.292,0.2565,4.4438,12.1763,2.38,66.3421,1.0341],"Cu":[13.338,3.5828,7.1676,0.247,5.6158,11.3966,1.6735,64.8126,1.191],"Zn":[14.0743,3.2655,7.0318,0.2333,5.1652,10.3163,2.41,58.7097,1.3041],"Ga":[15.2354,3.0669,6.7006,0.2412,4.3591,10.7805,2.9623,61.4135,1.7189],"Ge":[16.0816,2.8509,6.3747,0.2516,3.7068,11.4468,3.683,54.7625,2.1313],"As":[16.6723,2.6345,6.0701,0.2647,3.4313,12.9479,4.2779,47.7972,2.531],"Se":[17.0006,2.4098,5.8196,0.2726,3.9731,15.2372,4.3543,43.8163,2.8409],"Br":[17.1789,2.1723,5.2358,16.5796,5.6377,0.2609,3.9851,41.4328,2.9557],"Kr":[17.3555,1.9384,6.7286,16.5623,5.5493,0.2261,3.5375,39.3972,2.825],"Rb":[17.1784,1.7888,9.6435,17.3151,5.1399,0.2748,1.5292,164.934,3.4873],"Sr":[17.5663,1.5564,9.8184,14.0988,5.422,0.1664,2.6694,132.376,2.5064],"Y":[17.776,1.4029,10.2946,12.8006,5.72629,0.125599,3.26588,104.354,1.91213],"Zr":[17.8765,1.27618,10.948,11.916,5.41732,0.117622,3.65721,87.6627,2.06929],"Nb":[17.6142,1.18865,12.0144,11.766,4.04183,0.204785,3.53346,69.7957,3.75591],"Mo":[3.7025,0.2772,17.2356,1.0958,12.8876,11.004,3.7429,61.6584,4.3875],"Tc":[19.1301,0.864132,11.0948,8.14487,4.64901,21.5707,2.71263,86.8472,5.40428],"Ru":[19.2674,0.80852,12.9182,8.43467,4.86337,24.7997,1.56756,94.2928,5.37874],"Rh":[19.2957,0.751536,14.3501,8.21758,4.73425,25.8749,1.28918,98.6062,5.328],"Pd":[19.3319,0.698655,15.5017,7.98929,5.29537,25.2052,0.605844,76.8986,5.26593],"Ag":[19.2808,0.6446,16.6885,7.4726,4.8045,24.6605,1.0463,99.8156,5.179],"Cd":[19.2214,0.5946,17.6444,6.9089,4.461,24.7008,1.6029,87.4825,5.0694],"In":[19.1624,0.5476,18.5596,6.3776,4.2948,25.8499,2.0396,92.8029,4.9391],"Sn":[19.1889,5.8303,19.1005,0.5031,4.4585,26.8909,2.4663,83.9571,4.7821],"Sb":[19.6418,5.3034,19.0455,0.4607,5.0371,27.9074,2.6827,75.2825,4.5909],"Te":[19.9644,4.81742,19.0138,0.420885,6.14487,28.5284,2.5239,70.8403,4.352],"I":[20.1472,4.347,18.9949,0.3814,7.5138,27.766,2.2735,66.8776,4.0712],"Xe":[20.2933,3.9282,19.0298,0.344,8.9767,26.4659,1.99,64.2658,3.7118],"Cs":[20.3892,3.569,19.1062,0.3107,10.662,24.3879,1.4953,213.904,3.3352],"Ba":[20.3361,3.216,19.297,0.2756,10.888,20.2073,2.6959,167.202,2.7731],"La":[20.578,2.94817,19.599,0.244475,11.3727,18.7726,3.28719,133.124,2.14678],"Ce":[21.1671,2.81219,19.7695,0.226836,11.8513,17.6083,3.33049,127.113,1.86264],"Pr":[22.044,2.77393,19.6697,0.222087,12.3856,16.7669,2.82428,143.644,2.0583],"Nd":[22.6845,2.66248,19.6847,0.210628,12.774,15.885,2.85137,137.903,1.98486],"Pm":[23.3405,2.5627,19.6095,0.202088,13.1235,15.1009,2.87516,132.721,2.02876],"Sm":[24.0042,2.47274,19.4258,0.196451,13.4396,14.3996,2.89604,128.007,2.20963],"Eu":[24.6274,2.3879,19.0886,0.1942,13.7603,13.7546,2.9227,123.174,2.5745],"Gd":[25.0709,2.25341,19.0798,0.181951,13.8518,12.9331,3.54545,101.398,2.4196],"Tb":[25.8976,2.24256,18.2185,0.196143,14.3167,12.6648,2.95354,115.362,3.58324],"Dy":[26.507,2.1802,17.6383,0.202172,14.5596,12.1899,2.96577,111.874,4.29728],"Ho":[26.9049,2.07051,17.294,0.19794,14.5583,11.4407,3.63837,92.6566,4.56796],"Er":[27.6563,2.07356,16.4285,0.223545,14.9779,11.3604,2.98233,105.703,5.92046],"Tm":[28.1819,2.02859,15.8851,0.238849,15.1542,10.9975,2.98706,102.961,6.75621],"Yb":[28.6641,1.9889,15.4345,0.257119,15.3087,10.6647,2.98963,100.417,7.56672],"Lu":[28.9476,1.90182,15.2208,9.98519,15.1,0.261033,3.71601,84.3298,7.97628],"Hf":[29.144,1.83262,15.1726,9.5999,14.7586,0.275116,4.30013,72.029,8.58154],"Ta":[29.2024,1.77333,15.2293,9.37046,14.5135,0.295977,4.76492,63.3644,9.24354],"W":[29.0818,1.72029,15.43,9.2259,14.4327,0.321703,5.11982,57.056,9.8875],"Re":[28.7621,1.67191,15.7189,9.09227,14.5564,0.3505,5.44174,52.0861,10.472],"Os":[28.1894,1.62903,16.155,8.97948,14.9305,0.382661,5.67589,48.1647,11.0005],"Ir":[27.3049,1.59279,16.7296,8.86553,15.6115,0.417916,5.83377,45.0011,11.4722],"Pt":[27.0059,1.51293,17.7639,8.81174,15.7131,0.424593,5.7837,38.6103,11.6883],"Au":[16.8819,0.4611,18.5913,8.6216,25.5582,1.4826,5.86,36.3956,12.0658],"Hg":[20.6809,0.545,19.0417,8.4484,21.6575,1.5729,5.9676,38.3246,12.6089],"Tl":[27.5446,0.65515,19.1584,8.70751,15.538,1.96347,5.52593,45.8149,13.1746],"Pb":[31.0617,0.6902,13.0637,2.3576,18.442,8.618,5.9696,47.2579,13.4118],"Bi":[33.3689,0.704,12.951,2.9238,16.5877,8.7937,6.4692,48.0093,13.5782],"Po":[34.6726,0.700999,15.4733,3.55078,13.1138,9.55642,7.02588,47.0045,13.677],"At":[35.3163,0.68587,19.0211,3.97458,9.49887,11.3824,7.42518,45.4715,13.7108],"Rn":[35.5631,0.6631,21.2816,4.0691,8.0037,14.0422,7.4433,44.2473,13.6905],"Fr":[35.9299,0.646453,23.0547,4.17619,12.1439,23.1052,2.11253,150.645,13.7247],"Ra":[35.763,0.616341,22.9064,3.87135,12.4739,19.9887,3.21097,142.325,13.6211],"Ac":[35.6597,0.589092,23.1032,3.65155,12.5977,18.599,4.08655,117.02,13.5266],"Th":[35.5645,0.563359,23.4219,3.46204,12.7473,17.8309,4.80703,99.1722,13.4314],"Pa":[35.8847,0.547751,23.2948,3.41519,14.1891,16.9235,4.17287,105.251,13.4287],"U":[36.0228,0.5293,23.4128,3.3253,14.9491,16.0927,4.188,100.613,13.3966],"Li1+":[0.6968,4.6237,0.7888,1.9557,0.3414,0.6316,0.1563,10.0953,0.0167],"Na1+":[3.2565,2.6671,3.9362,6.1153,1.3998,0.2001,1.0032,14.039,0.404],"K1+":[7.9578,12.6331,7.4917,0.7674,6.359,-0.002,1.1915,31.9128,-4.9978],"Rb1+":[17.5816,1.7139,7.6598,14.7957,5.8981,0.1603,2.7817,31.2087,2.0782],"Cs1+":[20.3524,3.552,19.1278,0.3086,10.2821,23.7128,0.9615,59.4565,3.2791],"Mg2+":[3.4988,2.1676,3.8378,4.7542,1.3284,0.185,0.8497,10.1411,0.4853],"Ca2+":[15.6348,-0.0074,7.9518,0.6089,8.4372,10.3116,0.8537,25.9905,-14.875],"Sr2+":[18.0874,1.4907,8.1373,12.6963,2.5654,24.5651,-34.193,-0.0138,41.4025],"Ba2+":[20.1807,3.21367,19.1136,0.28331,10.9054,20.0558,0.77634,51.746,3.02902],"Zn2+":[11.9719,2.9946,7.3862,0.2031,6.4668,7.0826,1.394,18.0995,0.7807],"Ce4+":[20.3235,2.65941,19.8186,0.21885,12.1233,15.7992,0.144583,62.2355,1.5918],"F1-":[3.6322,5.27756,3.51057,14.7353,1.26064,0.442258,0.940706,47.3437,0.653396],"Cl1-":[18.2915,0.0066,7.2084,1.1717,6.5337,19.5424,2.3386,60.4486,-16.378],"Br1-":[17.1718,2.2059,6.3338,19.3345,5.5754,0.2871,3.7272,58.1535,3.1776],"I1-":[20.2332,4.3579,18.997,0.3815,7.8069,29.5259,2.8868,84.9304,4.0714],"O2-":[3.7504,16.5151,2.84294,6.59203,1.54298,0.319201,1.62091,43.3486,0.24206]};
// 異常分散の補正 [f', f''](Henke et al. 1993、各管球の Kα1 のエネルギー)。並びは cr fe co cu mo
export const DISP = {H:[-0.0,0.0,-0.0,0.0,-0.0,0.0,-0.0,0.0,-0.0,0.0],He:[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-0.0,0.0],Li:[0.003,0.001,0.002,0.001,0.002,0.0,0.001,0.0,-0.0,0.0],Be:[0.009,0.004,0.007,0.003,0.006,0.002,0.004,0.002,0.0,0.0],B:[0.02,0.01,0.015,0.007,0.013,0.006,0.01,0.004,0.001,0.001],C:[0.038,0.023,0.029,0.016,0.025,0.013,0.019,0.01,0.003,0.002],N:[0.063,0.043,0.048,0.03,0.042,0.025,0.033,0.018,0.007,0.003],O:[0.098,0.077,0.076,0.055,0.067,0.046,0.052,0.034,0.012,0.006],F:[0.137,0.124,0.107,0.088,0.095,0.075,0.075,0.055,0.018,0.01],Ne:[0.184,0.189,0.147,0.135,0.131,0.115,0.105,0.085,0.027,0.016],Na:[0.237,0.269,0.191,0.193,0.171,0.165,0.138,0.122,0.037,0.025],Mg:[0.296,0.391,0.243,0.283,0.22,0.243,0.18,0.181,0.051,0.038],Al:[0.332,0.515,0.28,0.375,0.256,0.322,0.212,0.242,0.064,0.052],Si:[0.376,0.686,0.327,0.502,0.303,0.432,0.256,0.325,0.082,0.07],P:[0.408,0.912,0.373,0.67,0.35,0.578,0.303,0.436,0.104,0.096],S:[0.402,1.136,0.392,0.839,0.376,0.726,0.335,0.551,0.124,0.124],Cl:[0.367,1.427,0.402,1.059,0.397,0.918,0.368,0.698,0.148,0.16],Ar:[0.292,1.822,0.399,1.359,0.414,1.181,0.407,0.901,0.182,0.209],K:[0.13,2.206,0.336,1.654,0.38,1.444,0.416,1.104,0.211,0.265],Ca:[-0.186,2.595,0.208,1.955,0.299,1.706,0.382,1.313,0.233,0.315],Sc:[-0.683,3.104,0.029,2.366,0.19,2.076,0.363,1.606,0.272,0.383],Ti:[-1.697,3.555,-0.337,2.736,-0.053,2.405,0.243,1.868,0.291,0.451],V:[-6.621,0.486,-0.905,3.171,-0.415,2.801,0.078,2.193,0.318,0.542],Cr:[-2.1,0.553,-1.915,3.488,-0.95,3.095,-0.158,2.439,0.326,0.614],Mn:[-1.602,0.66,-3.614,0.498,-2.106,3.562,-0.539,2.833,0.347,0.73],Fe:[-1.286,0.775,-2.052,0.578,-3.36,0.504,-1.144,3.209,0.358,0.846],Co:[-1.048,0.889,-1.549,0.663,-1.995,0.579,-2.383,3.563,0.356,0.962],Ni:[-0.896,1.066,-1.281,0.795,-1.557,0.69,-2.994,0.524,0.357,1.121],Cu:[-0.743,1.231,-1.076,0.917,-1.285,0.797,-1.975,0.608,0.342,1.285],Zn:[-0.609,1.418,-0.911,1.058,-1.086,0.92,-1.56,0.704,0.313,1.462],Ga:[-0.489,1.612,-0.766,1.204,-0.918,1.048,-1.287,0.802,0.255,1.646],Ge:[-0.364,1.843,-0.635,1.376,-0.777,1.198,-1.099,0.92,0.184,1.862],As:[-0.269,2.091,-0.525,1.563,-0.659,1.361,-0.946,1.046,0.074,2.086],Se:[-0.152,2.361,-0.399,1.764,-0.527,1.536,-0.794,1.181,-0.076,2.301],Br:[-0.062,2.648,-0.299,1.98,-0.422,1.726,-0.675,1.328,-0.276,2.552],Kr:[0.047,2.864,-0.175,2.135,-0.293,1.858,-0.535,1.427,-0.538,2.711],Rb:[0.101,3.208,-0.095,2.393,-0.206,2.083,-0.437,1.6,-0.93,2.969],Sr:[0.122,3.651,-0.042,2.74,-0.143,2.391,-0.359,1.845,-1.559,3.315],Y:[0.02,4.077,-0.056,3.087,-0.125,2.706,-0.278,2.109,-2.919,3.593],Zr:[0.176,4.502,0.091,3.382,0.011,2.953,-0.18,2.28,-3.045,0.581],Nb:[0.178,4.965,0.149,3.727,0.083,3.251,-0.094,2.506,-2.11,0.636],Mo:[0.142,5.407,0.18,4.076,0.133,3.555,-0.025,2.745,-1.694,0.701],Tc:[0.043,5.865,0.164,4.424,0.142,3.867,0.02,2.991,-1.437,0.764],Ru:[-0.093,6.378,0.144,4.823,0.155,4.218,0.073,3.263,-1.246,0.832],Rh:[-0.219,7.099,0.129,5.37,0.17,4.698,0.12,3.639,-1.122,0.936],Pd:[-0.475,7.735,0.064,5.879,0.16,5.148,0.174,3.985,-0.993,1.011],Ag:[-0.714,8.254,-0.026,6.276,0.11,5.5,0.176,4.265,-0.882,1.094],Cd:[-1.107,9.134,-0.18,6.945,0.019,6.088,0.157,4.728,-0.809,1.224],In:[-1.478,9.52,-0.331,7.261,-0.074,6.372,0.137,4.957,-0.71,1.288],Sn:[-2.242,10.419,-0.657,8.034,-0.276,7.073,0.088,5.52,-0.625,1.417],Sb:[-2.774,10.785,-0.876,8.262,-0.437,7.263,-0.015,5.665,-0.61,1.482],Te:[-4.302,12.657,-1.429,9.797,-0.755,8.64,-0.058,6.763,-0.419,1.758],I:[-5.531,13.089,-1.776,10.071,-0.99,8.868,-0.189,6.935,-0.415,1.826],Xe:[-9.668,12.514,-2.508,11.158,-1.446,9.844,-0.357,7.719,-0.309,2.04],Cs:[-11.001,13.355,-3.462,11.777,-2.083,10.441,-0.67,8.241,-0.256,2.182],Ba:[-11.662,10.688,-4.704,12.796,-2.812,11.384,-0.965,9.027,-0.16,2.396],La:[-13.803,3.808,-6.624,13.904,-3.703,12.345,-1.318,9.769,-0.108,2.618],Ce:[-9.46,4.068,-8.144,12.556,-4.828,12.592,-1.82,10.082,-0.096,2.731],Pr:[-8.172,4.316,-11.951,9.552,-6.919,13.129,-2.479,10.565,-0.093,2.902],Nd:[-7.393,4.666,-10.972,10.434,-8.422,12.46,-3.183,11.349,-0.04,3.13],Pm:[-6.727,4.909,-14.111,3.786,-10.918,9.523,-3.913,11.938,-0.096,3.297],Sm:[-6.395,5.533,-9.937,4.267,-11.007,10.818,-5.522,13.16,0.073,3.715],Eu:[-5.704,5.622,-8.084,4.342,-15.385,3.836,-8.931,11.588,-0.01,3.764],Gd:[-5.651,6.417,-7.569,4.951,-9.991,4.369,-9.371,13.246,0.103,4.258],Tb:[-5.014,6.224,-6.447,4.813,-7.876,4.259,-9.166,9.204,-0.078,4.166],Dy:[-4.786,6.595,-6.022,5.1,-7.106,4.516,-9.772,9.925,-0.093,4.414],Ho:[-4.757,7.429,-5.88,5.733,-6.796,5.07,-15.773,4.008,-0.017,4.993],Er:[-4.43,7.61,-5.345,5.88,-6.064,5.198,-9.47,4.1,-0.126,5.085],Tm:[-4.303,8.237,-5.117,6.367,-5.739,5.628,-8.149,4.436,-0.156,5.49],Yb:[-4.239,8.705,-4.935,6.741,-5.467,5.966,-7.313,4.717,-0.207,5.78],Lu:[-4.208,9.283,-4.796,7.182,-5.258,6.355,-6.767,5.027,-0.307,6.218],Hf:[-4.021,9.695,-4.512,7.542,-4.903,6.683,-6.138,5.279,-0.359,6.412],Ta:[-3.631,10.126,-4.075,7.82,-4.433,6.917,-5.491,5.476,-0.578,6.561],W:[-3.456,10.687,-3.805,8.255,-4.114,7.299,-5.024,5.77,-0.661,6.751],Re:[-3.408,11.257,-3.672,8.694,-3.942,7.69,-4.742,6.083,-0.859,7.106],Os:[-3.529,11.868,-3.698,9.178,-3.929,8.122,-4.639,6.429,-1.019,7.57],Ir:[-3.475,12.632,-3.551,9.745,-3.753,8.613,-4.401,6.807,-1.291,7.956],Pt:[-3.627,13.358,-3.606,10.328,-3.769,9.139,-4.336,7.237,-1.621,8.553],Au:[-3.91,14.434,-3.505,11.168,-3.564,9.839,-4.014,7.718,-1.826,8.843],Hg:[-3.674,14.943,-3.388,11.538,-3.467,10.199,-3.895,8.064,-2.255,9.298],Tl:[-3.886,15.604,-3.437,12.07,-3.461,10.676,-3.804,8.446,-2.638,9.69],Pb:[-4.091,16.375,-3.51,12.702,-3.481,11.254,-3.728,8.935,-3.173,10.124],Bi:[-4.369,17.079,-3.591,13.254,-3.506,11.736,-3.684,9.3,-3.937,10.56],Po:[-4.73,17.741,-3.796,13.786,-3.659,12.22,-3.754,9.702,-5.045,11.128],At:[-5.088,19.083,-3.854,14.827,-3.637,13.13,-3.643,10.401,-9.65,10.415],Rn:[-5.159,20.095,-3.74,15.628,-3.461,13.857,-3.364,11.009,-8.093,10.478],Fr:[-5.518,20.995,-3.786,16.323,-3.423,14.469,-3.216,11.492,-6.771,7.655],Ra:[-6.166,21.911,-4.099,17.046,-3.647,15.113,-3.328,12.004,-6.371,8.158],Ac:[-6.884,22.521,-4.386,17.605,-3.813,15.616,-3.346,12.388,-6.427,8.494],Th:[-7.783,23.938,-4.679,18.692,-3.98,16.583,-3.361,13.17,-6.613,8.78],Pa:[-9.333,25.42,-5.312,19.947,-4.472,17.707,-3.693,14.049,-8.172,10.11],U:[-11.38,23.416,-7.737,18.897,-6.807,17.298,-5.216,14.023,-10.007,10.371]};
// 波長 nm [Kα1, Kα2, Kβ1]: X-ray Data Booklet Table 1-2 の光子エネルギーから λ = hc/E
export const LAM = {cr:[0.2289762,0.2293664,0.2084921],fe:[0.1936091,0.1940030,0.1756653],co:[0.1789011,0.1792897,0.1620829],cu:[0.1540601,0.1544430,0.1392253],mo:[0.0709319,0.0713607,0.0632305]};
// 293 K の温度因子 B (Å²): Peng et al., Acta Cryst. A52 (1996) 456
export const B293 = {Li:4.8089,Be:0.423,C:0.1435,Na:6.6583,Mg:1.8122,Al:0.7806,Si:0.4849,K:10.7067,Ca:1.9968,Sc:0.7455,Ti:0.5138,V:0.5718,Cr:0.251,Fe:0.325,Ni:0.3559,Cu:0.5505,Zn:1.142,Ge:0.6};
// </data>

const RAD = Math.PI / 180;
const DIAMOND_A = 0.35669; // ダイヤモンド(準安定)の格子定数 nm(ASM、周期表ツールと同じ値)
const GRAPHITE_D002 = 0.6709 / 2; // 黒鉛モノクロメーターの (002) 面間隔 nm(周期表ツールの黒鉛 c = 0.6709 nm)

// ---- 構造 ----
const FCC = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
const add = (ps, [dx, dy, dz]) => ps.map(([x, y, z]) => [x + dx, y + dy, z + dz]);
const at = (sp, ps) => ps.map(p => [sp, ...p]);
// sites: [種類(A か B), x, y, z]。u はウルツ鉱型の内部パラメーター
export const STRUCT = {
  sc: { lat: 'cubic', sites: () => at('A', [[0, 0, 0]]) },
  bcc: { lat: 'cubic', sites: () => at('A', [[0, 0, 0], [0.5, 0.5, 0.5]]) },
  fcc: { lat: 'cubic', sites: () => at('A', FCC) },
  diamond: { lat: 'cubic', sites: () => at('A', [...FCC, ...add(FCC, [0.25, 0.25, 0.25])]) },
  hcp: { lat: 'hex', sites: () => at('A', [[1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]]) },
  nacl: { lat: 'cubic', two: true, sites: () => [...at('A', FCC), ...at('B', add(FCC, [0.5, 0, 0]))] },
  cscl: { lat: 'cubic', two: true, sites: () => [...at('A', [[0, 0, 0]]), ...at('B', [[0.5, 0.5, 0.5]])] },
  zb: { lat: 'cubic', two: true, sites: () => [...at('A', FCC), ...at('B', add(FCC, [0.25, 0.25, 0.25]))] },
  fluorite: { lat: 'cubic', two: true, sites: () => [...at('A', FCC), ...at('B', add(FCC, [0.25, 0.25, 0.25])), ...at('B', add(FCC, [0.75, 0.75, 0.75]))] },
  l12: { lat: 'cubic', two: true, sites: () => [...at('A', [[0, 0, 0]]), ...at('B', [[0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]])] },
  wurtzite: { lat: 'hex', two: true, sites: u => [...at('A', [[1 / 3, 2 / 3, 0], [2 / 3, 1 / 3, 0.5]]), ...at('B', [[1 / 3, 2 / 3, u], [2 / 3, 1 / 3, 0.5 + u]])] },
};
export const TYPES = Object.keys(STRUCT);

// ---- 波長 ----
// src: 管球と線。ka12 は Kα1 と Kα2(強度 2 : 1)、ka は重み付き平均 (2λ1 + λ2)/3 の1本
export const SRC = ['cuka1', 'cuka12', 'cuka', 'coka1', 'coka12', 'crka1', 'crka12', 'feka1', 'feka12', 'moka1', 'moka12', 'custom'];
export const tube = src => (src === 'custom' ? null : src.slice(0, 2));
export function srcLambda(src) {
  const t = tube(src);
  if (!t) return null;
  const [l1, l2] = LAM[t];
  return src.endsWith('ka') ? (2 * l1 + l2) / 3 : l1;
}
export const KA2_RATIO = 0.5;

// ---- 原子散乱因子 ----
const TUBES = ['cr', 'fe', 'co', 'cu', 'mo'];
export const elementOf = sp => sp.replace(/\d*[+-]$/, '');
// f0(s)(ITC Vol. C Table 6.1.1.4 の4つのガウス関数の和、s = sinθ/λ Å⁻¹)
export function f0(sp, s) {
  const c = F0[sp];
  if (!c) return NaN;
  let f = c[8];
  for (let i = 0; i < 8; i += 2) f += c[i] * Math.exp(-c[i + 1] * s * s);
  return f;
}
// 異常分散の補正 [f′, f″]。管球の線のときだけ(任意の波長では 0)
export function dispersion(sp, t) {
  const d = DISP[elementOf(sp)], i = TUBES.indexOf(t);
  return d && i >= 0 ? [d[2 * i], d[2 * i + 1]] : [0, 0];
}

// ---- 面間隔 ----
export function invD2(lat, a, c, h, k, l) {
  return lat === 'hex' ? (4 / 3) * (h * h + h * k + k * k) / (a * a) + (l * l) / (c * c) : (h * h + k * k + l * l) / (a * a);
}
export const twoTheta = (d, lam) => { const x = lam / (2 * d); return x <= 1 ? 2 * Math.asin(x) / RAD : NaN; };

// 同じ形の面(族)の代表の指数。立方晶は |h| ≥ |k| ≥ |l|、六方晶は 3 指数 (h k l) で h ≥ k ≥ 0, l ≥ 0
function family(lat, h, k, l) {
  if (lat === 'hex') {
    const [p, q, r] = [Math.abs(h), Math.abs(k), Math.abs(h + k)].sort((x, y) => y - x);
    return [q, r, Math.abs(l)];
  }
  return [Math.abs(h), Math.abs(k), Math.abs(l)].sort((x, y) => y - x);
}
const famKey = f => f.join(',');
export const hklLabel = f => (f.some(x => x > 9) ? `(${f.join(' ')})` : `(${f.join('')})`);

// LP 因子
export function lpFactor(tt, mono, lam) {
  const th = tt * RAD / 2, c2 = Math.cos(tt * RAD) ** 2;
  if (mono === 'graphite') {
    const x = lam / (2 * GRAPHITE_D002);
    const cm = x < 1 ? Math.cos(2 * Math.asin(x)) ** 2 : 1;
    return (1 + cm * c2) / ((1 + cm) * Math.sin(th) ** 2 * Math.cos(th));
  }
  return (1 + c2) / (Math.sin(th) ** 2 * Math.cos(th));
}

// 1つの反射の構造因子 F(複素数 [実部, 虚部])。fs は種類ごとの [実部, 虚部]
export function structureFactor(sites, fs, h, k, l) {
  let re = 0, im = 0;
  for (const [sp, x, y, z] of sites) {
    const ph = 2 * Math.PI * (h * x + k * y + l * z), [fr, fi] = fs[sp];
    const cs = Math.cos(ph), sn = Math.sin(ph);
    re += fr * cs - fi * sn;
    im += fr * sn + fi * cs;
  }
  return [re, im];
}

// 種類ごとの散乱因子(温度因子をかけたもの)。s は sinθ/λ (Å⁻¹)
function scatter(p, s) {
  const t = p.disp === 'off' ? null : tube(p.src);
  const dw = Math.exp(-p.B * s * s);
  const one = sp => { const [d1, d2] = t ? dispersion(sp, t) : [0, 0]; return [(f0(sp, s) + d1) * dw, d2 * dw]; };
  return { A: one(p.ea), B: STRUCT[p.type].two ? one(p.eb) : [0, 0] };
}

// 回折パターン。p: { type, a, c, u (nm, -), ea, eb (種類), lam (nm), src, B (Å²), disp, mono, tmin, tmax }
// 返り値 lines: 低角から順に { fams, label, d, tt, m, F2, f, LP, DW, I, rel }(I は Σ|F|²·LP、rel は最大 = 100)
export function simulate(p) {
  const st = STRUCT[p.type];
  const lat = st.lat, a = p.a, c = lat === 'hex' ? p.c : p.a;
  const sites = st.sites(p.u);
  const dmin = p.lam / (2 * Math.sin(Math.min(p.tmax, 179.9) * RAD / 2));
  const dmax = p.tmin > 0 ? p.lam / (2 * Math.sin(p.tmin * RAD / 2)) : Infinity;
  const H = Math.ceil((lat === 'hex' ? 2 / Math.sqrt(3) : 1) * a / dmin) + 1, L = Math.ceil(c / dmin) + 1;
  if (!(H < 60 && L < 60)) return { lines: [], tooMany: true };
  const groups = new Map();
  for (let h = -H; h <= H; h++) for (let k = -H; k <= H; k++) for (let l = -L; l <= L; l++) {
    if (!h && !k && !l) continue;
    const q = invD2(lat, a, c, h, k, l), d = 1 / Math.sqrt(q);
    if (d < dmin * (1 - 1e-12) || d > dmax * (1 + 1e-12)) continue;
    // 同じ d の反射を1本にまとめる(立方晶は h²+k²+l²、六方晶は h²+hk+k² と l² が同じもの)
    const key = lat === 'hex' ? `${h * h + h * k + k * k}|${l * l}` : `${h * h + k * k + l * l}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { d, hkl: [] });
    g.hkl.push([h, k, l]);
  }
  const lines = [];
  for (const g of groups.values()) {
    const tt = twoTheta(g.d, p.lam);
    if (!Number.isFinite(tt)) continue;
    const s = 1 / (2 * g.d * 10); // sinθ/λ = 1/(2d)、d nm → Å
    const fs = scatter(p, s);
    let sum = 0, m = 0, F2max = 0;
    const fams = new Map();
    const F2s = g.hkl.map(([h, k, l]) => { const [re, im] = structureFactor(sites, fs, h, k, l); return re * re + im * im; });
    const big = Math.max(...F2s);
    g.hkl.forEach(([h, k, l], i) => {
      const F2 = F2s[i];
      const f = family(lat, h, k, l), fk = famKey(f);
      if (!fams.has(fk)) fams.set(fk, { f, m: 0, F2: 0 });
      const e = fams.get(fk);
      if (F2 > 1e-6 * Math.max(big, 1)) { e.m++; e.F2 = Math.max(e.F2, F2); m++; }
      sum += F2;
      F2max = Math.max(F2max, F2);
    });
    // 消滅した族は除く(F² がほぼ 0)
    const live = [...fams.values()].filter(e => e.m > 0).sort((x, y) => y.F2 * y.m - x.F2 * x.m);
    if (!live.length || F2max < 1e-6) continue;
    const LP = lpFactor(tt, p.mono, p.lam);
    lines.push({ fams: live, label: live.map(e => hklLabel(e.f)).join('+'), f: live[0].f, d: g.d, tt, s, m, F2: sum / m, LP, I: sum * LP, fs });
  }
  lines.sort((x, y) => x.tt - y.tt);
  const top = Math.max(0, ...lines.map(x => x.I));
  for (const x of lines) x.rel = top ? (100 * x.I) / top : 0;
  return { lines, lat, sites };
}

// 線の形(擬フォークト、η = 0.5、高さ 1)
export const profile = (x, w) => { const t = (x / w) ** 2; return 0.5 / (1 + 4 * t) + 0.5 * Math.exp(-4 * Math.LN2 * t); };

// ---- 指数づけ(立方晶) ----
export const INDEX_TYPES = ['sc', 'bcc', 'fcc', 'diamond'];
// 構造ごとの h²+k²+l² の値と、その代表の (hkl)
const NLIST = (() => {
  const out = { sc: new Map(), bcc: new Map(), fcc: new Map(), diamond: new Map() };
  const ok = { sc: () => true, bcc: (h, k, l) => (h + k + l) % 2 === 0, fcc: (h, k, l) => [h, k, l].every(x => x % 2 === 0) || [h, k, l].every(x => x % 2 === 1),
    diamond: (h, k, l) => [h, k, l].every(x => x % 2 === 1) || ([h, k, l].every(x => x % 2 === 0) && (h + k + l) % 4 === 0) };
  for (let h = 0; h <= 24; h++) for (let k = 0; k <= h; k++) for (let l = 0; l <= k; l++) {
    const N = h * h + k * k + l * l;
    if (!N || N > 600) continue;
    for (const t of INDEX_TYPES) if (ok[t](h, k, l)) { const m = out[t]; if (!m.has(N)) m.set(N, []); m.get(N).push([h, k, l]); }
  }
  return Object.fromEntries(Object.entries(out).map(([t, m]) => [t, [...m.keys()].sort((x, y) => x - y).map(N => ({ N, hkl: m.get(N) }))]));
})();
export const allowedN = t => NLIST[t].map(x => x.N);
export const nrFunc = th => 0.5 * (Math.cos(th) ** 2 / Math.sin(th) + Math.cos(th) ** 2 / th); // Nelson–Riley(θ はラジアン)
const ttCalc = (lam, a, N, z = 0) => { const x = lam * Math.sqrt(N) / (2 * a); return x < 1 ? 2 * Math.asin(x) / RAD + z : NaN; };

// 線形の最小二乗 y = b0 + b1 x(σ は残差から)
export function linfit(xs, ys) {
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  const b1 = sxx ? sxy / sxx : 0, b0 = my - b1 * mx;
  const sse = ys.reduce((s, y, i) => s + (y - b0 - b1 * xs[i]) ** 2, 0);
  const v = n > 2 ? sse / (n - 2) : NaN;
  return { b0, b1, s1: Math.sqrt(v / sxx), s0: Math.sqrt(v * (1 / n + (mx * mx) / sxx)), r2: syy ? 1 - sse / syy : 1, n };
}

// 格子定数(と零点のずれ z)を、2θ の残差の二乗和が最小になるように求める(ガウス–ニュートン法)
export function fitLattice(lam, obs, Ns, a0, withZero) {
  let a = a0, z = 0;
  for (let it = 0; it < 50; it++) {
    // J: d(2θ)/da = −2 tanθ / a(ラジアン → 度)、d(2θ)/dz = 1
    let jaa = 0, jaz = 0, jzz = 0, ra = 0, rz = 0;
    obs.forEach((t, i) => {
      const th = Math.asin(lam * Math.sqrt(Ns[i]) / (2 * a));
      const r = t - (2 * th / RAD + z), ja = (-2 * Math.tan(th) / a) / RAD;
      jaa += ja * ja; jaz += ja; jzz += 1; ra += ja * r; rz += r;
    });
    let da, dz = 0;
    if (withZero) { const det = jaa * jzz - jaz * jaz; da = (jzz * ra - jaz * rz) / det; dz = (jaa * rz - jaz * ra) / det; } else da = ra / jaa;
    a += da; z += dz;
    if (Math.abs(da) < 1e-13 && Math.abs(dz) < 1e-11) break;
  }
  const res = obs.map((t, i) => t - ttCalc(lam, a, Ns[i], z));
  const p = withZero ? 2 : 1, n = obs.length;
  const sse = res.reduce((s, r) => s + r * r, 0);
  // 標準誤差: σ² (JᵀJ)⁻¹
  let jaa = 0, jaz = 0, jzz = 0;
  obs.forEach((t, i) => { const th = Math.asin(lam * Math.sqrt(Ns[i]) / (2 * a)), ja = (-2 * Math.tan(th) / a) / RAD; jaa += ja * ja; jaz += ja; jzz += 1; });
  const v = n > p ? sse / (n - p) : NaN;
  const sa = withZero ? Math.sqrt(v * jzz / (jaa * jzz - jaz * jaz)) : Math.sqrt(v / jaa);
  const sz = withZero ? Math.sqrt(v * jaa / (jaa * jzz - jaz * jaz)) : NaN;
  return { a, z, sa, sz, res, rms: Math.sqrt(sse / n) };
}

// 測った 2θ(度、昇順でなくてよい)を立方晶の4つの構造で指数づけする。tol: 合うとみなす 2θ のずれ(度)
// fit: 'lsq'(a だけ)、'lsqz'(a と零点のずれ)、'nr'(Nelson–Riley 関数への外挿)、'cs'(cos²θ/sinθ への外挿)
export function indexCubic(tts, lam, tol, fit = 'lsq') {
  const obs = tts.filter(t => t > 0 && t < 180).sort((x, y) => x - y);
  const res = [];
  if (obs.length < 2) return { obs, res };
  const s2 = obs.map(t => Math.sin(t * RAD / 2) ** 2);
  for (const type of INDEX_TYPES) {
    const L = NLIST[type];
    let best = null;
    // 候補の a: 低角の3本のどれかが、低い方から 12 個の N のどれかに当たるとして
    for (let i = 0; i < Math.min(3, obs.length); i++) for (let j = 0; j < Math.min(12, L.length); j++) {
      let a = lam * Math.sqrt(L[j].N) / (2 * Math.sqrt(s2[i]));
      let r = null;
      for (let pass = 0; pass < 3; pass++) {
        r = assign(obs, lam, a, 0, type, tol);
        const m = r.match.filter(x => x.ok);
        if (m.length < 2) break;
        const f = fitLattice(lam, m.map(x => x.t), m.map(x => x.N), a, false);
        a = f.a;
      }
      if (!r) continue;
      const cand = scoreCand(obs, lam, a, type, tol);
      if (!best || better(cand, best)) best = cand;
    }
    if (best) res.push(best);
  }
  // 並べ替えは better() の順(合った数 − 見えない反射の数/2 → 合った数 → ずれ → 小さい単位胞。SC と BCC の同点は BCC)
  res.sort((x, y) => (better(x, y) ? -1 : better(y, x) ? 1 : 0));
  // いちばん良い構造で、選んだ方法の格子定数を求める
  for (const r of res) refine(r, lam, fit);
  return { obs, res };
}
// 比べ方: 合ったピークの数から「見えない反射」の数の半分を引いた点が高い → 合ったピークが多い → ずれが小さい → 小さい単位胞。
// 合った数だけで比べると、Kβ 線などの余分なピークまで合わせる大きな単位胞(見えない反射が何十本もある)が選ばれてしまう
const NPT = { sc: 1, bcc: 2, fcc: 4, diamond: 4 }; // 単位胞の中の格子点の数
const candScore = r => r.nMatch - 0.5 * r.nMissing;
function better(x, y) {
  if (candScore(x) !== candScore(y)) return candScore(x) > candScore(y);
  if (x.nMatch !== y.nMatch) return x.nMatch > y.nMatch;
  if (Math.abs(x.rms - y.rms) > 1e-4) return x.rms < y.rms;
  // SC と BCC(a_BCC = √2 a_SC)は sin²θ の比が同じ。単純立方の元素はほとんどないので BCC を先に
  if (x.type !== y.type && [x.type, y.type].sort().join() === 'bcc,sc' && Math.abs(Math.max(x.a, y.a) / Math.min(x.a, y.a) - Math.SQRT2) < 2e-3) return x.type === 'bcc';
  // それ以外の同点は、格子点1つあたりの体積が小さい方(同じピークを説明できるいちばん小さい単位胞)
  return x.a ** 3 / NPT[x.type] < y.a ** 3 / NPT[y.type];
}
// 各ピークに、いちばん近い許される N を当てる
function assign(obs, lam, a, z, type, tol) {
  const L = NLIST[type];
  return {
    match: obs.map(t => {
      const s = Math.sin((t - z) * RAD / 2) ** 2, Nf = s * 4 * a * a / (lam * lam);
      let bestE = null;
      for (const e of L) {
        if (e.N > Nf * 1.5 + 4) break;
        const dt = t - ttCalc(lam, a, e.N, z);
        if (Number.isFinite(dt) && (!bestE || Math.abs(dt) < Math.abs(bestE.dt))) bestE = { N: e.N, hkl: e.hkl, dt };
      }
      return bestE ? { t, ...bestE, ok: Math.abs(bestE.dt) <= tol } : { t, N: NaN, hkl: [], dt: NaN, ok: false };
    }),
  };
}
function scoreCand(obs, lam, a, type, tol, z = 0) {
  const { match } = assign(obs, lam, a, z, type, tol);
  const ok = match.filter(x => x.ok);
  const lo = obs[0] - tol, hi = obs[obs.length - 1] + tol;
  // 測った範囲の中で、この構造なら出るはずなのに、どのピークにも当たらない線
  const missing = NLIST[type].filter(e => { const t = ttCalc(lam, a, e.N, z); return t >= lo && t <= hi && !ok.some(x => x.N === e.N); });
  const rms = ok.length ? Math.sqrt(ok.reduce((s, x) => s + x.dt * x.dt, 0) / ok.length) : Infinity;
  return { type, a, z, match, nMatch: ok.length, missing, nMissing: missing.length, rms, tol };
}
function refine(r, lam, fit) {
  const m = r.match.filter(x => x.ok);
  r.fit = fit;
  if (m.length < 2) return;
  const t = m.map(x => x.t), N = m.map(x => x.N);
  r.each = m.map(x => { const th = x.t * RAD / 2; return { t: x.t, N: x.N, a: lam * Math.sqrt(x.N) / (2 * Math.sin(th)), nr: nrFunc(th), cs: Math.cos(th) ** 2 / Math.sin(th) }; });
  if (fit === 'nr' || fit === 'cs') {
    // 外挿: a_i を外挿関数に対して直線で当てはめ、関数 = 0(θ = 90°)での値を a とする
    const f = linfit(r.each.map(e => e[fit]), r.each.map(e => e.a));
    r.final = { a: f.b0, sa: f.s0, slope: f.b1, r2: f.r2, z: 0 };
  } else {
    const f = fitLattice(lam, t, N, r.a, fit === 'lsqz' && m.length >= 3);
    r.final = { a: f.a, sa: f.sa, z: f.z, sz: f.sz, rms: f.rms };
  }
  // 求めた a(と z)で、もう一度当てはめて、ずれを出す
  const sc = scoreCand(r.obs ?? r.match.map(x => x.t), lam, r.final.a, r.type, r.tol, r.final.z || 0);
  r.match = sc.match; r.nMatchFinal = sc.nMatch; r.missingFinal = sc.missing;
}

// ---- 結晶子の大きさとひずみ ----
// rows: [{ tt, b (測った幅, 度), bi (装置の幅, 度) }]、corr: 'none' | 'gauss'(β² = βm² − βi²)| 'lorentz'(β = βm − βi)
export function sizeStrain(rows, lam, K, corr) {
  const pts = rows.map(r => {
    const bi = corr === 'none' ? 0 : r.bi;
    const bdeg = corr === 'gauss' ? Math.sqrt(r.b * r.b - bi * bi) : corr === 'lorentz' ? r.b - bi : r.b;
    const ok = Number.isFinite(bdeg) && bdeg > 0 && r.b > bi;
    const th = r.tt * RAD / 2, beta = bdeg * RAD;
    return { ...r, bi, bdeg, beta, th, ok: ok && r.tt > 0 && r.tt < 180,
      D: (K * lam) / (beta * Math.cos(th)), eps: beta / (4 * Math.tan(th)), x: 4 * Math.sin(th), y: beta * Math.cos(th) };
  });
  const good = pts.filter(p => p.ok);
  const wh = good.length >= 2 ? linfit(good.map(p => p.x), good.map(p => p.y)) : null;
  if (wh) { wh.D = wh.b0 > 0 ? (K * lam) / wh.b0 : NaN; wh.eps = wh.b1; wh.sD = wh.b0 > 0 ? (K * lam) * wh.s0 / (wh.b0 * wh.b0) : NaN; }
  return { pts, wh };
}

// ---- ピークの移動 ----
// 格子が Δa/a = e だけ伸びたときの 2θ。d は同じ割合で伸びる(等方的なひずみ)
export function shiftOf(d0, lam, e) {
  const t0 = twoTheta(d0, lam), t1 = twoTheta(d0 * (1 + e), lam);
  const approx = -2 * e * Math.tan(t0 * RAD / 2) / RAD;
  return { t0, t1, exact: t1 - t0, approx };
}
// ベガード則 a(x) = (1 − x)·aA + x·aB
export const vegardX = (a, aA, aB) => (a - aA) / (aB - aA);

// ---- 材料の蔵書 ----
// 元素: 周期表ツールのデータ(25 °C、ASM などの格子定数)のうち、立方晶(BCC・FCC・ダイヤモンド・単純立方)と HCP のもの
const ELTYPE = { bcc: 'bcc', fcc: 'fcc', dia: 'diamond', hcp: 'hcp' };
export const MATS = [];
for (const e of EL) {
  const type = ELTYPE[e.c] ?? (e.st === 'sc' ? 'sc' : null);
  if (type && e.a) MATS.push({ id: e.s, kind: 'el', type, a: e.a, c: e.cc, ea: e.s, B: B293[e.s] ?? 0, E: typeof e.E === 'number' ? e.E : null });
  if (e.s === 'C') MATS.push({ id: 'C', kind: 'el', type: 'diamond', a: DIAMOND_A, ea: 'C', B: B293.C, E: null });
}
MATS.sort((x, y) => EL.findIndex(e => e.s === x.id) - EL.findIndex(e => e.s === y.id));
// 化合物(出典は sources.md)。イオン結晶はイオンの散乱因子を使う
const CMP = [
  // 7番目は温度因子 B (Å²)。2種類の原子の B の平均を全原子に使う(出典のあるものだけ。ほかは 0)
  //   NaCl: B(Na) 1.59・B(Cl) 1.38(1 bar・室温の平均二乗変位 0.142・0.132 Å から B = 8π²⟨u²⟩。Finger & King 1978 の Table 1)
  //   MgO: B(Mg) 0.34・B(O) 0.37(23 °C、Hazen 1976 の Table 1)
  ['NaCl', 'nacl', 0.56404, 'Na1+', 'Cl1-', null, null, 1.48],
  ['KCl', 'nacl', 0.62931, 'K1+', 'Cl1-'],
  ['LiF', 'nacl', 0.40293, 'Li1+', 'F1-'],
  ['MgO', 'nacl', 0.4212, 'Mg2+', 'O2-', null, null, 0.36],
  ['CaF2', 'fluorite', 0.54626, 'Ca2+', 'F1-'],
  ['ZnS', 'zb', 0.5406, 'Zn', 'S'],
  ['GaAs', 'zb', 0.565325, 'Ga', 'As'],
  ['AlAs', 'zb', 0.56611, 'Al', 'As'],
  ['InAs', 'zb', 0.60583, 'In', 'As'],
  ['InP', 'zb', 0.58697, 'In', 'P'],
  ['GaP', 'zb', 0.54505, 'Ga', 'P'],
  ['ZnS-w', 'wurtzite', 0.38227, 'Zn', 'S', 0.62607, 0.3748],
  ['ZnO', 'wurtzite', 0.324992, 'Zn', 'O', 0.520658, 0.3817], // u: Kisi & Elcombe (1989) の中性子回折
];
for (const [id, type, a, ea, eb, c, u, B] of CMP) MATS.push({ id, kind: 'cmp', type, a, ea, eb, c: c ?? undefined, u: u ?? undefined, B: B ?? 0, E: null });
export const matById = id => MATS.find(m => m.id === id);
// ベガード則の組(端の格子定数 nm)。x は B の割合
export const VEGARD = {
  cuni: ['Cu', 'Ni', 0.36146, 0.3524, 'fcc'],
  agau: ['Ag', 'Au', 0.40857, 0.40782, 'fcc'],
  fecr: ['Fe', 'Cr', 0.28665, 0.28848, 'bcc'],
  sige: ['Si', 'Ge', 0.54306, 0.56574, 'diamond'],
  algaas: ['GaAs', 'AlAs', 0.565325, 0.56611, 'zb'],
  ingaas: ['GaAs', 'InAs', 0.565325, 0.60583, 'zb'],
};

// ---- 入力の読み取り(貼り付けた数の並び) ----
// 1行に1つのピーク。区切りは空白・タブ・セミコロン・コンマ。行に空白やタブがあるときのコンマは小数点とみなす(ドイツ語の書き方)
export function parseRows(text) {
  const rows = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim();
    if (!line) continue;
    const sepWS = /[\s;]/.test(line);
    const parts = (sepWS ? line.split(/[\s;]+/) : line.split(',')).map(x => x.replace(',', '.').replace('−', '-'));
    const nums = parts.map(Number).filter(Number.isFinite);
    if (nums.length) rows.push(nums);
  }
  return rows;
}

// 曲線(線の形をつけたパターン)。幅 FWHM = w0 + w1·tanθ(度)。ka12 なら Kα2 の線(強度 1/2、波長 λ2)も足す。
// 線の面積が積分強度に比例するように、高さは I/FWHM にする
// 返り値: pts [[2θ, 高さ]]、height: 各線の Kα1 の位置での曲線の高さ(最大 = 100)、lines2: Kα2 の線
export function pattern(lines, p) {
  const t = tube(p.src), doublet = !!t && p.src.endsWith('ka12');
  const width = tt => Math.max(0.005, p.w0 + p.w1 * Math.tan(tt * RAD / 2));
  const peaks = lines.map(l => ({ tt: l.tt, I: l.rel, w: width(l.tt) }));
  const lines2 = [];
  if (doublet) {
    const lam2 = LAM[t][1];
    for (const l of lines) { const tt2 = twoTheta(l.d, lam2); if (Number.isFinite(tt2) && tt2 <= p.tmax) { lines2.push({ tt: tt2, rel: l.rel * KA2_RATIO }); peaks.push({ tt: tt2, I: l.rel * KA2_RATIO, w: width(tt2) }); } }
  }
  const y = x => { let s = 0; for (const q of peaks) { const dx = x - q.tt; if (Math.abs(dx) < 40 * q.w) s += (q.I / q.w) * profile(dx, q.w); } return s; };
  const xs = new Set();
  const n = 900;
  for (let i = 0; i <= n; i++) xs.add(p.tmin + (p.tmax - p.tmin) * i / n);
  for (const q of peaks) for (let j = -12; j <= 12; j++) { const x = q.tt + j * q.w / 4; if (x >= p.tmin && x <= p.tmax) xs.add(x); }
  const pts = [...xs].sort((a, b) => a - b).map(x => [x, y(x)]);
  const raw = lines.map(l => y(l.tt));
  const top = Math.max(1e-12, ...pts.map(q => q[1]), ...raw);
  return { pts: pts.map(([x, v]) => [x, (100 * v) / top]), height: raw.map(v => (100 * v) / top), lines2: lines2.map(l => ({ ...l, rel: l.rel })), doublet, width };
}

// ================= ここから画面 =================
const form = document.getElementById('xrd-form');
if (form) {
  const T = JSON.parse(form.dataset.text);
  const el = form.elements;
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const lang = document.documentElement.lang || 'en';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const minus = t => (/^-0(?:[.,]0*)?$/.test(t) ? t.slice(1) : t.replace(/^-/, '−'));
  // 小数点以下 n 桁(その言語の書き方)
  const fx = (x, n) => (Number.isFinite(x) ? minus(x.toLocaleString(lang, { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: false })) : '–');
  const tpl = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const val = (k, min = -Infinity) => { const s = String(el[k].value).trim(), v = s === '' ? NaN : Number(s); return Number.isFinite(v) && v >= min ? v : Number(el[k].defaultValue); };
  const SUPC = { '+': '⁺', '-': '⁻', 1: '', 2: '²', 3: '³', 4: '⁴' };
  const spLabel = sp => { const m = sp.match(/^([A-Za-z]+)(\d)([+-])$/); return m ? `${m[1]}${SUPC[m[2]]}${SUPC[m[3]]}` : sp; };
  const fmtF = s => s.replace(/(\d)/g, '$1').replace('CaF2', 'CaF₂').replace('ZnS-w', 'ZnS');
  const MODES = ['sim', 'index', 'size', 'shift'];

  // ---- 見た目(サイトの CSS に足りない分だけ。色はサイトの変数) ----
  const style = document.createElement('style');
  style.textContent = `
.xrd-tabs{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin:0 0 4px}
#xrd-form .xrd-span2{grid-column:span 2}
.xrd-tabs button{font:inherit;font-size:.92rem;padding:8px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;min-height:40px}
.xrd-tabs button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:700}
#xrd-form .xrd-sub{grid-column:1/-1;margin:6px 0 -4px;font-size:.8rem;font-weight:700;color:var(--muted);letter-spacing:.02em;border-top:1px solid var(--border);padding-top:8px}
#xrd-form .xrd-wide{grid-column:1/-1}
#xrd-form textarea{font:inherit;font-size:.95rem;font-variant-numeric:tabular-nums;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;width:100%;min-height:9em;resize:vertical;box-sizing:border-box}
#xrd-form select{font-size:.92rem;padding-left:6px;padding-right:6px}
.xrd-btns{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
.xrd-btns .btn{font-size:.85rem}
.xrd-fig{margin:0 0 8px;padding:8px;border-radius:12px;background:var(--surface);border:1px solid var(--border)}
.xrd-fig svg{display:block;width:100%;height:auto;margin:0 auto;touch-action:manipulation}
.xrd-fig text{fill:var(--text);font-family:inherit}
.xrd-fig .m{fill:var(--muted)}
.xrd-fig .a{fill:var(--accent);font-weight:700}
.xrd-fig .grid{stroke:var(--border);stroke-width:1}
.xrd-fig .axis{stroke:var(--muted);stroke-width:1.2;fill:none}
.xrd-fig .stick{stroke:var(--text);stroke-width:1.6}
.xrd-fig .stick2{stroke:var(--muted);stroke-width:1.2;stroke-dasharray:3 2}
.xrd-fig .stick.sel{stroke:var(--accent);stroke-width:3}
.xrd-fig .curve{stroke:var(--accent);stroke-width:1.6;fill:none}
.xrd-fig .fit{stroke:var(--accent);stroke-width:2;fill:none}
.xrd-fig .dash{stroke:var(--muted);stroke-width:1.4;stroke-dasharray:6 4;fill:none}
.xrd-fig .pt{fill:var(--accent)}
.xrd-fig .pt2{fill:var(--surface);stroke:var(--muted);stroke-width:1.5}
.xrd-fig .hit{fill:transparent;cursor:pointer}
.xrd-tw{max-height:26em;overflow:auto;border:1px solid var(--border);border-radius:8px}
.xrd-tw .dy-table{font-size:.88rem}
.xrd-tw .dy-table th,.xrd-tw .dy-table td{padding:6px 8px}
.xrd-tw thead th{position:sticky;top:0;background:var(--surface);z-index:1}
.xrd-tw tr[data-pick]{cursor:pointer}
.xrd-tw tr.sel td,.xrd-tw tr.sel th{background:var(--accent-soft,rgba(127,127,127,.15))}
.xrd-tw td.bad{color:var(--ng);font-weight:700}
.xrd-tw td.good{color:var(--ok)}
.xrd-steps{margin:0;padding-left:1.4em;line-height:1.7}
.xrd-steps li{margin:0 0 .35em;overflow-wrap:anywhere}
.xrd-note{font-size:.85rem;color:var(--muted);margin:.4em 0}
.xrd-warn{font-size:.9rem;color:var(--ng);margin:.4em 0}
.xrd-out h3{margin:1em 0 .4em;font-size:1rem}
@media (max-width:460px){.xrd-tw .dy-table th,.xrd-tw .dy-table td{padding:5px 5px}.xrd-tw .dy-table{font-size:.8rem}}
`;
  document.head.append(style);

  // ---- モードのタブ ----
  const modeLab = el.mode.closest('label');
  modeLab.hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'xrd-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', T.tabs_label);
  tabs.innerHTML = MODES.map(m => `<button type="button" data-mode="${m}" aria-pressed="false">${esc(T[`tab_${m}`])}</button>`).join('');
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || el.mode.value === b.dataset.mode) return;
    el.mode.value = b.dataset.mode;
    el.mode.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 選択肢の文字と並び ----
  const lamOf = s => srcLambda(s);
  for (const o of el.src.options) if (o.value !== 'custom') o.textContent = `${o.textContent} (${fx(lamOf(o.value), 5)} nm)`;
  const typeName = t => T[`tn_${t}`] ?? t;
  // 材料: 元素と化合物に分けて並べる
  {
    const sel = el.mat, keep = sel.value, gEl = document.createElement('optgroup'), gCm = document.createElement('optgroup');
    gEl.label = T.og_el; gCm.label = T.og_cmp;
    for (const o of [...sel.options]) {
      const m = matById(o.value);
      if (!m) continue;
      o.textContent = m.kind === 'el' ? `${m.id} — ${typeName(m.type)}` : `${fmtF(m.id)} — ${typeName(m.type)}`;
      (m.kind === 'el' ? gEl : gCm).append(o);
    }
    const custom = [...sel.options].find(o => o.value === 'custom');
    sel.prepend(gEl); sel.append(gCm);
    if (custom) sel.append(custom);
    sel.value = keep; // 選択肢を動かすと選ばれた値が変わることがあるので戻す
  }
  for (const name of ['ea', 'eb']) {
    const sel = el[name], keep = sel.value, gA = document.createElement('optgroup'), gI = document.createElement('optgroup');
    gA.label = T.og_atom; gI.label = T.og_ion;
    [...sel.options].forEach((o, i) => { const ion = /[+-]$/.test(o.value); o.textContent = ion ? spLabel(o.value) : `${i + 1} ${o.value}`; (ion ? gI : gA).append(o); });
    sel.append(gA, gI);
    sel.value = keep;
  }

  // 文字の長い選択肢は2列ぶんの幅にする
  for (const n of ['src', 'mat', 'type', 'ea', 'eb', 'fit', 'kshape', 'corr', 'vg', 'mono', 'disp']) el[n].closest('label').classList.add('xrd-span2');
  // ---- 入力欄のまとまり(見出し)と、モードごとの表示 ----
  const SHOW = {
    src: 'sim index size shift', lambda: 'sim index size shift',
    mat: 'sim shift', type: 'sim shift', ea: 'sim', eb: 'sim', a: 'sim shift', c: 'sim shift', u: 'sim',
    bdw: 'sim', disp: 'sim', mono: 'sim', tmin: 'sim', tmax: 'sim', fwhm: 'sim', fwt: 'sim', h: 'sim shift', k: 'sim shift', l: 'sim shift',
    tol: 'index', fit: 'index', kshape: 'size', K: 'size', corr: 'size', binst: 'size',
    strain: 'shift', tm: 'shift', E: 'shift', nu: 'shift', vg: 'shift', va: 'shift', vb: 'shift', tv: 'shift', vh: 'shift', vk: 'shift', vl: 'shift',
  };
  const GROUP = [['src', 'g_xray', 'sim index size shift'], ['mat', 'g_sample', 'sim shift'], ['bdw', 'g_int', 'sim'], ['tmin', 'g_view', 'sim'], ['h', 'g_hkl', 'sim shift'],
    ['tol', 'g_index', 'index'], ['kshape', 'g_size', 'size'], ['strain', 'g_strain', 'shift'], ['vg', 'g_vegard', 'shift']];
  const subs = GROUP.map(([name, key, modes]) => {
    const p = document.createElement('p');
    p.className = 'xrd-sub'; p.textContent = T[key]; p.dataset.modes = modes;
    el[name].closest('label').before(p);
    return p;
  });
  // 貼り付ける欄(テキストは tool-share の URL に入らないので、この JS が pk・sz として URL に入れる)
  const mkArea = (name, after, label, hint, examples) => {
    const wrap = document.createElement('div');
    wrap.className = 'xrd-wide'; wrap.dataset.modes = name === 'pk' ? 'index' : 'size';
    wrap.innerHTML = `<label class="dy-field"><span>${esc(label)}</span><textarea name="${name}" rows="8" spellcheck="false" autocomplete="off"></textarea></label>
<p class="xrd-note">${esc(hint)}</p><div class="xrd-btns">${examples.map(([k, t]) => `<button type="button" class="btn btn-ghost btn-small" data-ex="${k}">${esc(t)}</button>`).join('')}</div>`;
    el[after].closest('label').after(wrap);
    return wrap;
  };
  // 例のデータ(出典は sources.md): Al・Si は大学の資料に載った PDF カードの 2θ(Cu Kα1)、Fe は NBS、NaCl は Handbook of Mineralogy の d から 2θ(λ = 0.15406 nm)
  const toTT = ds => ds.map(d => fx(twoTheta(d / 10, 0.15406), 3).replace(',', '.'));
  const EX_INDEX = {
    alkb: ['34.64', '38.47', '44.74', '65.14', '78.23', '82.44', '99.08', '112.05', '116.57', '137.46'],
    al: ['38.47', '44.74', '65.14', '78.23', '82.44', '99.08', '112.05', '116.57', '137.46'],
    fe: toTT([2.0268, 1.4332, 1.1702, 1.0134, 0.9064, 0.8275]),
    si: ['28.44', '47.30', '56.12', '69.13', '76.38', '88.03', '94.95', '106.72', '114.09', '127.55', '136.90'],
    nacl: toTT([3.258, 2.821, 1.994, 1.628, 1.410, 1.261, 1.1515]), // 弱い (311)・(331) は載っていない(指数づけでは「見えない反射」として数えられる)
  };
  // 結晶子の大きさの例: 計算で作った値(Ni、D = 20 nm、ε = 0.15 %、K = 0.9、装置の幅 0.08°、ガウス型で足し合わせ)
  const EX_SIZE = ['44.494 0.575 0.08', '51.847 0.614 0.08', '76.378 0.780 0.08', '92.933 0.942 0.08', '98.437 1.010 0.08'];
  const pkWrap = mkArea('pk', 'fit', T.pk_label, T.pk_hint, [['alkb', T.ex_alkb], ['al', T.ex_al], ['fe', T.ex_fe], ['si', T.ex_si], ['nacl', T.ex_nacl]]);
  const szWrap = mkArea('sz', 'binst', T.sz_label, T.sz_hint, [['ni', T.ex_ni]]);
  const pk = el.pk, sz = el.sz;
  pk.value = pk.defaultValue = EX_INDEX.alkb.join('\n');
  sz.value = sz.defaultValue = EX_SIZE.join('\n');
  pkWrap.addEventListener('click', e => { const b = e.target.closest('[data-ex]'); if (!b) return; pk.value = EX_INDEX[b.dataset.ex].join('\n'); if (b.dataset.ex !== 'alkb' && el.src.value !== 'cuka1' && el.src.value !== 'cuka12') { el.src.value = 'cuka1'; el.lambda.value = String(+lamOf('cuka1').toFixed(6)); } pk.dispatchEvent(new Event('input', { bubbles: true })); });
  szWrap.addEventListener('click', e => { const b = e.target.closest('[data-ex]'); if (!b) return; sz.value = EX_SIZE.join('\n'); sz.dispatchEvent(new Event('input', { bubbles: true })); });

  // URL の pk・sz(行は ~、数は空白で区切る)
  const enc = text => parseRows(text).map(r => r.join(' ')).join('~');
  const dec = q => q.split('~').map(s => s.trim()).filter(Boolean).join('\n');
  // tool-share.js が先に URL を書き直す(数値と選択肢だけ残す)ので、開いたときの URL はナビゲーションの記録から読む
  const navUrl = (() => { try { return performance.getEntriesByType('navigation')[0]?.name; } catch { return null; } })();
  const params = new URLSearchParams(navUrl ? new URL(navUrl, location.href).search : location.search);
  if (params.has('pk')) pk.value = dec(params.get('pk'));
  if (params.has('sz')) sz.value = dec(params.get('sz'));
  const shareFields = [...el].filter(x => x.name && (x.tagName === 'SELECT' || x.type === 'number'));
  const initial = x => (x.tagName === 'SELECT' ? ([...x.options].find(o => o.defaultSelected) ?? x.options[0])?.value : x.defaultValue);
  // tool-share.js と同じ形で URL を書き、そのあとに pk・sz を足す(tool-share.js の書き換えのあとに呼ぶ)
  function syncUrl() {
    const changed = shareFields.some(x => x.value !== initial(x));
    const q = changed ? shareFields.map(x => `${x.name}=${encodeURIComponent(x.value)}`) : [];
    for (const ta of [pk, sz]) if (enc(ta.value) !== enc(ta.defaultValue)) q.push(`${ta.name}=${encodeURIComponent(enc(ta.value))}`);
    const query = q.length ? `?${q.join('&')}` : '';
    history.replaceState(history.state, '', location.pathname + query + location.hash);
    document.querySelectorAll('.lang-switch a').forEach(a => { a.search = query; });
  }

  // ---- 入力どうしのつながり ----
  const setNum = (name, v, d = 6) => { el[name].value = Number.isFinite(v) ? String(+v.toFixed(d)) : ''; };
  function applyMat() {
    const m = matById(el.mat.value);
    if (!m) return;
    el.type.value = m.type; el.ea.value = m.ea; if (m.eb) el.eb.value = m.eb;
    setNum('a', m.a);
    if (m.c) setNum('c', m.c);
    if (m.u) setNum('u', m.u, 4);
    setNum('bdw', m.B, 4);
    if (m.E) setNum('E', m.E, 1);
  }
  // 手で変えた値が蔵書の値と違えば「自分で入力」にする
  function checkMat() {
    const m = matById(el.mat.value);
    if (!m) return;
    const same = el.type.value === m.type && el.ea.value === m.ea && (!STRUCT[m.type].two || el.eb.value === m.eb) && Math.abs(val('a') - m.a) < 1e-9
      && (STRUCT[m.type].lat !== 'hex' || Math.abs(val('c') - m.c) < 1e-9) && (m.type !== 'wurtzite' || Math.abs(val('u') - m.u) < 1e-9);
    if (!same) el.mat.value = 'custom';
  }
  const KSHAPE = { k094: 0.94, k089: 0.89, k09: 0.9, k1: 1 };
  function onInput(e) {
    const n = e?.target?.name;
    if (n === 'mat') applyMat();
    if (['type', 'ea', 'eb', 'a', 'c', 'u'].includes(n)) checkMat();
    if (n === 'src' && el.src.value !== 'custom') setNum('lambda', lamOf(el.src.value), 7);
    if (n === 'lambda') { const l = val('lambda', 1e-4); if (el.src.value !== 'custom' && Math.abs(l - lamOf(el.src.value)) > 5e-7) el.src.value = 'custom'; }
    if (n === 'kshape' && KSHAPE[el.kshape.value]) setNum('K', KSHAPE[el.kshape.value], 3);
    if (n === 'K' && KSHAPE[el.kshape.value] !== val('K')) el.kshape.value = 'custom';
    if (n === 'vg' && VEGARD[el.vg.value]) { setNum('va', VEGARD[el.vg.value][2]); setNum('vb', VEGARD[el.vg.value][3]); }
    if ((n === 'va' || n === 'vb') && VEGARD[el.vg.value] && (val('va') !== VEGARD[el.vg.value][2] || val('vb') !== VEGARD[el.vg.value][3])) el.vg.value = 'custom';
    update();
    setTimeout(syncUrl);
  }

  // 周期表ツールのリンク(type と a だけ)から来たときは、同じ構造・格子定数の元素を選ぶ
  if (params.has('a') && !params.has('mat')) {
    const m = MATS.find(x => x.type === el.type.value && Math.abs(x.a - val('a')) < 1e-7);
    if (m) { el.mat.value = m.id; el.ea.value = m.ea; setNum('bdw', m.B, 4); if (m.c) setNum('c', m.c); if (m.E) setNum('E', m.E, 1); } else el.mat.value = 'custom';
  }
  if (params.has('lambda') && !params.has('src')) { const l = val('lambda'); if (Math.abs(l - lamOf(el.src.value)) > 5e-7) { const s = SRC.find(x => x !== 'custom' && Math.abs(lamOf(x) - l) < 5e-7); el.src.value = s ?? 'custom'; } }

  // ---- 共通の部品 ----
  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    return Promise.resolve(fallback());
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch {}
      ta.remove(); return ok;
    }
  }
  // 表。rows は [[見出しのセル, セル…]]、csv は CSV の行(数は小数点「.」のまま)
  const tableHTML = (id, head, rows, opts = {}) => `<div class="xrd-tw"><table class="dy-table"><thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r, i) => `<tr${opts.pick?.[i] ? ` data-pick="${esc(opts.pick[i])}"` : ''}${opts.sel === i ? ' class="sel"' : ''}><th scope="row">${r[0]}</th>${r.slice(1).map((c, j) => `<td data-out="${id}-${i}-${j}"${opts.cls?.[i]?.[j] ? ` class="${opts.cls[i][j]}"` : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const csvBtn = key => `<div class="xrd-btns"><button type="button" class="btn btn-ghost btn-small" data-csv="${key}" data-done="${esc(T.copied)}">${esc(T.csv_copy)}</button></div>`;
  let CSV = {};
  document.querySelector('.dy').addEventListener('click', async e => {
    const b = e.target.closest('[data-csv]');
    if (b && CSV[b.dataset.csv]) {
      if (await copyText(CSV[b.dataset.csv])) { const old = b.textContent; b.textContent = b.dataset.done; setTimeout(() => { b.textContent = old; }, 1600); }
      return;
    }
    const r = e.target.closest('tr[data-pick]');
    if (r) pickHKL(r.dataset.pick);
  });
  const csvLine = cells => cells.map(c => (typeof c === 'number' ? (Number.isFinite(c) ? String(+c.toPrecision(8)) : '') : /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',');
  const stats = items => `<dl class="dy-stats">${items.map(([k, v, ok]) => `<div><dt>${esc(k)}</dt><dd${ok == null ? '' : ` data-ok="${ok}"`}>${v}</dd></div>`).join('')}</dl>`;
  function pickHKL(s) {
    const [h, k, l] = s.split(',').map(Number);
    el.h.value = h; el.k.value = k; el.l.value = l;
    el.h.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---- 図(SVG) ----
  const niceStep = (span, n) => { const s = 10 ** Math.floor(Math.log10(span / n)); return [1, 2, 2.5, 5, 10].map(k => k * s).find(k => span / k <= n) ?? 10 * s; };
  const ticks = (a, b, n) => { const st = niceStep(b - a, n), o = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) o.push(+v.toPrecision(10)); return o; };
  const decs = st => Math.max(0, -Math.floor(Math.log10(st) + 1e-9));
  // 枠と目盛り。g: { W, H, m: {l,r,t,b}, x0,x1,y0,y1, xlabel, ylabel, nx, ny }
  function frame(g) {
    const xt = ticks(g.x0, g.x1, g.nx ?? 8), yt = g.yt ?? ticks(g.y0, g.y1, g.ny ?? 5);
    const xd = decs(xt[1] - xt[0] || 1), yd = decs(yt[1] - yt[0] || 1);
    const fs = g.fs ?? 13;
    // 縦軸の目盛りの桁が多いときは、軸の名前と重ならないよう左の余白を広げる
    const yw = Math.max(...yt.map(v => fx(v, g.yd ?? yd).length)) * fs * 0.6;
    g.m = { ...g.m, l: Math.max(g.m.l, Math.ceil(yw + fs * 1.5 + 12)) };
    const pw = g.W - g.m.l - g.m.r, ph = g.H - g.m.t - g.m.b;
    const X = v => g.m.l + ((v - g.x0) / (g.x1 - g.x0)) * pw, Y = v => g.m.t + ph - ((v - g.y0) / (g.y1 - g.y0)) * ph;
    // 端の目盛りの数字は内側に寄せる(図の外へのはみ出し・原点での重なりを防ぐ)
    const xa = v => (X(v) < g.m.l + 2 ? 'start' : X(v) > g.m.l + pw - 2 ? 'end' : 'middle');
    const s = `<rect x="${g.m.l}" y="${g.m.t}" width="${pw}" height="${ph}" class="axis"/>`
      + xt.map(v => `<line class="grid" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${g.m.t}" y2="${g.m.t + ph}"/><text class="m" font-size="${fs}" x="${X(v).toFixed(1)}" y="${g.m.t + ph + fs + 3}" text-anchor="${xa(v)}">${fx(v, g.xd ?? xd)}</text>`).join('')
      + yt.map(v => `<line class="grid" x1="${g.m.l}" x2="${g.m.l + pw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="m" font-size="${fs}" x="${g.m.l - 5}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fx(v, g.yd ?? yd)}</text>`).join('')
      + `<text font-size="${fs + 1}" x="${g.m.l + pw / 2}" y="${g.H - 6}" text-anchor="middle">${esc(g.xlabel)}</text>`
      + `<text font-size="${fs + 1}" transform="translate(${fs + 2} ${g.m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(g.ylabel)}</text>`;
    return { s, X, Y, pw, ph, m: g.m };
  }
  const svgWrap = (W, H, title, body, extra = '') => `<div class="xrd-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"${extra}><title>${esc(title)}</title>${body}</svg></div>`;
  const path = (pts, X, Y) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const small = () => out('chart').clientWidth < 520;

  // ================= シミュレーション =================
  function simParams() {
    const type = el.type.value;
    return { type, a: val('a', 0.05), c: val('c', 0.05), u: val('u', 0), ea: el.ea.value, eb: el.eb.value, lam: val('lambda', 0.005), src: el.src.value,
      B: val('bdw', 0), disp: el.disp.value, mono: el.mono.value, tmin: Math.min(val('tmin', 0), 178), tmax: Math.min(Math.max(val('tmax', 1), val('tmin', 0) + 1), 179.9),
      w0: val('fwhm', 0.001), w1: val('fwt', 0) };
  }
  function renderSim() {
    const p = simParams();
    const r = simulate(p);
    const st = STRUCT[p.type];
    if (r.tooMany) { out('summary').innerHTML = `<p class="xrd-warn">${esc(T.too_many)}</p>`; out('chart').innerHTML = out('table').innerHTML = out('steps').innerHTML = ''; return; }
    const pat = pattern(r.lines, p);
    const H = Math.round(val('h')), K = Math.round(val('k')), L = Math.round(val('l'));
    const selF = family(st.lat, H, K, L).join(',');
    const selIdx = r.lines.findIndex(x => x.fams.some(f => f.f.join(',') === selF));
    // ---- 要点 ----
    const strongest = r.lines.reduce((a, b) => (b.rel > (a?.rel ?? -1) ? b : a), null);
    const q = invD2(st.lat, p.a, p.c, H, K, L), d = q > 0 ? 1 / Math.sqrt(q) : NaN, tt = twoTheta(d, p.lam);
    const sel = selIdx >= 0 ? r.lines[selIdx] : null;
    out('summary').innerHTML = stats([
      [T.s_nlines, `${r.lines.length}`],
      [T.s_strong, strongest ? `${strongest.label} ${fx(strongest.tt, 2)}°` : '–'],
      [tpl(T.s_d, { hkl: hklLabel([H, K, L]) }), Number.isFinite(d) ? `${fx(d, 5)} nm` : '–'],
      [tpl(T.s_tt, { hkl: hklLabel([H, K, L]) }), Number.isFinite(tt) ? `${fx(tt, 3)}°` : q > 0 ? T.no_peak : '–'],
      [T.s_rule, !(q > 0) ? '–' : !Number.isFinite(tt) ? T.no_peak : sel ? `${T.rule_yes} · ${fx(sel.rel, 1)} %` : (tt < p.tmin || tt > p.tmax) && allowedHere(p, H, K, L) ? T.out_range : T.rule_no, sel ? true : q > 0 && Number.isFinite(tt) && !allowedHere(p, H, K, L) ? false : null],
    ]) + `<p class="xrd-note">${esc(tpl(T.sim_note, { lam: fx(p.lam, 5) }))}${pat.doublet ? ' ' + esc(T.sim_note_ka2) : ''}${p.disp === 'on' && !tube(p.src) ? ' ' + esc(T.sim_note_nodisp) : ''}</p>`;
    // ---- 図 ----
    const sm = small();
    const W = sm ? 360 : 720, Hh = sm ? 260 : 330, m = sm ? { l: 40, r: 8, t: 12, b: 38 } : { l: 48, r: 12, t: 14, b: 42 };
    const yMax = 128; // 上に指数の文字の場所をとる(目盛りは 100 まで)
    const f = frame({ W, H: Hh, m, x0: p.tmin, x1: p.tmax, y0: 0, y1: yMax, xlabel: T.ax_tt, ylabel: T.ax_int, nx: sm ? 6 : 12, yt: [0, 25, 50, 75, 100], fs: sm ? 11 : 13 });
    const curve = `<path class="curve" d="${path(pat.pts, f.X, f.Y)}"/>`;
    const sticks2 = pat.lines2.filter(l => l.tt >= p.tmin).map(l => `<line class="stick2" x1="${f.X(l.tt).toFixed(1)}" x2="${f.X(l.tt).toFixed(1)}" y1="${f.Y(0).toFixed(1)}" y2="${f.Y(l.rel).toFixed(1)}"/>`).join('');
    const sticks = r.lines.map((l, i) => `<line class="stick${i === selIdx ? ' sel' : ''}" x1="${f.X(l.tt).toFixed(1)}" x2="${f.X(l.tt).toFixed(1)}" y1="${f.Y(0).toFixed(1)}" y2="${f.Y(l.rel).toFixed(1)}"/>`).join('');
    // 指数の文字: 強い順に、隣と重ならないものだけ(縦書き)
    const placed = [];
    const minGap = sm ? 12 : 13;
    const order = r.lines.map((l, i) => i).sort((i, j) => r.lines[j].rel - r.lines[i].rel);
    let labels = '';
    for (const i of order) {
      const l = r.lines[i];
      if (l.rel < 1.5 && i !== selIdx) continue;
      const x = f.X(l.tt);
      if (placed.some(px => Math.abs(px - x) < minGap)) continue;
      placed.push(x);
      const top = Math.max(l.rel, pat.height[i] ?? 0);
      // 重なった反射が多いときは最初の指数だけにし、文字が図の上の枠からはみ出さないようにする
      const parts = l.label.split('+'), lab = parts.length > 2 ? `${parts[0]}+…` : l.label;
      const len = lab.length * (sm ? 10 : 11) * 0.62;
      const y = Math.max(f.Y(top) - 4, m.t + 4 + len);
      labels += `<text font-size="${sm ? 10 : 11}" class="${i === selIdx ? 'a' : 'm'}" transform="translate(${(x + 3.5).toFixed(1)} ${y.toFixed(1)}) rotate(-90)">${esc(lab)}</text>`;
    }
    const hits = r.lines.map(l => `<rect class="hit" data-pick="${l.f.join(',')}" x="${(f.X(l.tt) - 5).toFixed(1)}" y="${m.t}" width="10" height="${f.ph}"><title>${esc(`${l.label} 2θ = ${fx(l.tt, 3)}°, d = ${fx(l.d, 5)} nm, I = ${fx(l.rel, 1)} %`)}</title></rect>`).join('');
    const legend = `<text font-size="${sm ? 10 : 12}" x="${W - m.r - 4}" y="${m.t + 14}" text-anchor="end" class="m">${esc(pat.doublet ? T.lg_ka12 : T.lg_ka1)}</text>`;
    out('chart').innerHTML = svgWrap(W, Hh, T.chart_sim, f.s + curve + sticks2 + sticks + labels + legend + hits)
      + `<p class="xrd-note">${esc(T.chart_sim_note)}</p>`;
    out('chart').querySelector('svg').addEventListener('click', e => { const t = e.target.closest('[data-pick]'); if (t) pickHKL(t.dataset.pick); });
    // ---- 表 ----
    const two = st.two;
    const head = [T.c_hkl, T.c_d, T.c_tt, T.c_m, T.c_F2, T.c_LP, T.c_I, T.c_h];
    const rows = r.lines.map((l, i) => [esc(l.label), fx(l.d, 5), fx(l.tt, 3), `${l.m}`, fx(l.F2, 1), fx(l.LP, 2), fx(l.rel, 1), fx(pat.height[i], 1)]);
    CSV.sim = [csvLine(['hkl', 'd_nm', '2theta_deg', 'multiplicity', 'F2', 'LP', 'I_integrated_rel', 'peak_height_rel']),
      ...r.lines.map((l, i) => csvLine([l.label, l.d, l.tt, l.m, l.F2, l.LP, l.rel, pat.height[i]]))].join('\n');
    out('table').innerHTML = `<h3>${esc(T.h_lines)}</h3>` + tableHTML('sim', head, rows, { pick: r.lines.map(l => l.f.join(',')), sel: selIdx })
      + `<p class="xrd-note">${esc(T.table_sim_note)}</p>` + csvBtn('sim');
    // ---- 途中の式 ----
    out('steps').innerHTML = `<h3>${esc(tpl(T.h_steps_sim, { hkl: hklLabel([H, K, L]) }))}</h3>` + simSteps(p, r, H, K, L, d, tt, sel, two);
  }
  function allowedHere(p, h, k, l) {
    const st = STRUCT[p.type], lat = st.lat;
    const q = invD2(lat, p.a, p.c, h, k, l); if (!(q > 0)) return false;
    const s = Math.sqrt(q) / 20; // sinθ/λ = 1/(2d)、d nm → Å
    const [re, im] = structureFactor(st.sites(p.u), scatter(p, s), h, k, l);
    return re * re + im * im > 1e-6 * Math.max(1, f0(p.ea, s) ** 2);
  }
  function simSteps(p, r, H, K, L, d, tt, sel, two) {
    const st = STRUCT[p.type], li = [];
    if (!(d > 0)) return `<p>${esc(T.st_000)}</p>`;
    const N = H * H + K * K + L * L;
    li.push(st.lat === 'hex'
      ? tpl(T.st_d_hex, { h: H, k: K, l: L, a: fx(p.a, 5), c: fx(p.c, 5), q: fx(1 / (d * d), 3), d: fx(d, 5) })
      : tpl(T.st_d_cub, { h: H, k: K, l: L, N, a: fx(p.a, 5), d: fx(d, 5) }));
    if (!Number.isFinite(tt)) { li.push(tpl(T.st_nopeak, { lam: fx(p.lam, 5), x: fx(p.lam / (2 * d), 4) })); return `<ol class="xrd-steps">${li.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`; }
    const th = tt / 2, s = 1 / (2 * d * 10);
    li.push(tpl(T.st_bragg, { lam: fx(p.lam, 5), d: fx(d, 5), x: fx(p.lam / (2 * d), 5), th: fx(th, 4), tt: fx(tt, 4) }));
    li.push(tpl(T.st_s, { d: fx(d * 10, 4), s: fx(s, 4), s2: fx(s * s, 4) }));
    const t = p.disp === 'off' ? null : tube(p.src);
    const fl = sp => { const f = f0(sp, s), [d1, d2] = t ? dispersion(sp, t) : [0, 0]; return tpl(T.st_f, { sp: spLabel(sp), f0: fx(f, 3), d1: fx(d1, 3), d2: fx(d2, 3), dw: fx(Math.exp(-p.B * s * s), 4), B: fx(p.B, 3) }); };
    li.push(fl(p.ea));
    if (two) li.push(fl(p.eb));
    const [re, im] = structureFactor(st.sites(p.u), scatter(p, s), H, K, L);
    const F2 = re * re + im * im;
    li.push(tpl(T[`rule_${p.type}`] ?? '', {}) + ' ' + tpl(T.st_F, { re: fx(re, 3), im: fx(im, 3), F2: fx(F2, 2) }));
    if (!sel) { li.push(F2 < 1e-6 * Math.max(1, f0(p.ea, s) ** 2) ? T.st_absent : T.out_range); return `<ol class="xrd-steps">${li.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`; }
    li.push(tpl(T.st_m, { m: sel.m, fams: sel.fams.map(e => `${hklLabel(e.f)}×${e.m}`).join(' + ') }));
    li.push(tpl(p.mono === 'graphite' ? T.st_lp_mono : T.st_lp, { tt: fx(tt, 3), lp: fx(sel.LP, 3) }));
    const top = r.lines.reduce((a, b) => (b.I > a.I ? b : a));
    li.push(tpl(T.st_I, { m: sel.m, F2: fx(sel.F2, 2), lp: fx(sel.LP, 3), I: fx(sel.I, 0), top: fx(top.I, 0), thkl: top.label, rel: fx(sel.rel, 2) }));
    return `<ol class="xrd-steps">${li.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  }

  // ================= 指数づけ =================
  function renderIndex() {
    const lam = val('lambda', 0.005), tol = val('tol', 0.001), fit = el.fit.value;
    const rows = parseRows(pk.value);
    const tts = rows.map(r => r[0]);
    const ix = indexCubic(tts, lam, tol, fit);
    if (ix.obs.length < 2) { out('summary').innerHTML = `<p class="xrd-warn">${esc(T.ix_few)}</p>`; out('chart').innerHTML = out('table').innerHTML = out('steps').innerHTML = ''; return; }
    const best = ix.res[0], fin = best.final ?? { a: best.a };
    // 同じくらい合う候補(SC と BCC は 6 本までは見分けられない)
    const ties = ix.res.filter(r => r !== best && r.nMatch === best.nMatch && r.nMissing === best.nMissing && Math.abs(r.rms - best.rms) < 0.002);
    const nOk = best.match.filter(x => x.ok).length;
    const pm = Number.isFinite(fin.sa) ? ` ± ${fx(fin.sa, 6)}` : '';
    out('summary').innerHTML = stats([
      [T.ix_best, esc(typeName(best.type))],
      [T.ix_a, `${fx(fin.a, 6)}${pm} nm`],
      [T.ix_match, `${nOk} / ${ix.obs.length}`, nOk === ix.obs.length],
      [T.ix_rms, `${fx(best.rms, 3)}°`],
      ...(fit === 'lsqz' && Number.isFinite(fin.z) ? [[T.ix_zero, `${fx(fin.z, 3)}°`]] : []),
      ...((fit === 'nr' || fit === 'cs') && Number.isFinite(fin.slope) ? [[T.ix_slope, `${fx(fin.slope, 6)} nm`]] : []),
    ]) + (ties.length ? `<p class="xrd-warn">${esc(tpl(T.ix_tie, { t: ties.map(r => `${typeName(r.type)} (a = ${fx(r.final?.a ?? r.a, 5)} nm)`).join(', ') }))}</p>` : '')
      + (best.missing.length ? `<p class="xrd-note">${esc(tpl(T.ix_missing, { list: best.missing.slice(0, 8).map(e => hklLabel(NLIST[best.type].find(x => x.N === e.N).hkl[0])).join(', ') }))}</p>` : '')
      + `<h3>${esc(T.h_cand)}</h3>` + tableHTML('cand', [T.c_type, T.c_a, T.c_nmatch, T.c_nmiss, T.c_rms],
        ix.res.map(r => [esc(typeName(r.type)), fx(r.final?.a ?? r.a, 5), `${r.nMatch} / ${ix.obs.length}`, `${r.nMissing}`, fx(r.rms, 3)]));
    // 合わないピークに Kβ・Kα2 の見込みを添える
    const t = tube(el.src.value);
    const hint = x => {
      if (!t) return '';
      const okm = best.match.filter(y => y.ok);
      for (const y of okm) {
        const tb = ttCalc(LAM[t][2], fin.a, y.N), t2 = ttCalc(LAM[t][1], fin.a, y.N);
        if (Math.abs(tb - x.t) <= Math.max(tol, 0.1)) return tpl(T.ix_kb, { hkl: hklLabel(y.hkl[0]) });
        if (Math.abs(t2 - x.t) <= Math.max(tol, 0.05)) return tpl(T.ix_ka2, { hkl: hklLabel(y.hkl[0]) });
      }
      return '';
    };
    const s1 = Math.sin(best.match[0].t * RAD / 2) ** 2;
    const firstOk = best.match.find(x => x.ok);
    const sFirst = firstOk ? Math.sin(firstOk.t * RAD / 2) ** 2 : s1;
    const head = [T.c_tt_obs, 'sin²θ', T.c_ratio, 'N', T.c_hkl, T.c_ai, T.c_tt_calc, T.c_dtt, T.c_judge];
    const trs = best.match.map(x => {
      const s = Math.sin(x.t * RAD / 2) ** 2, ai = x.ok ? lam * Math.sqrt(x.N) / (2 * Math.sqrt(s)) : NaN;
      const tc = Number.isFinite(x.N) ? ttCalc(lam, fin.a, x.N, fin.z || 0) : NaN;
      return { x, s, ai, tc, dt: x.t - tc };
    });
    const rowsT = trs.map(({ x, s, ai, tc, dt }) => [fx(x.t, 3), fx(s, 5), fx((s / sFirst) * (firstOk?.N ?? 1), 2), x.ok ? `${x.N}` : '–', x.ok ? hklLabel(x.hkl[0]) + (x.hkl.length > 1 ? '+' + x.hkl.slice(1).map(hklLabel).join('+') : '') : '–',
      x.ok ? fx(ai, 5) : '–', fx(tc, 3), fx(dt, 3), x.ok ? T.ok_mark : `${T.ng_mark}${hint(x) ? ' ' + hint(x) : ''}`]);
    CSV.index = [csvLine(['2theta_obs', 'sin2theta', 'ratio', 'N', 'hkl', 'a_i_nm', '2theta_calc', 'delta_2theta', 'match']),
      ...trs.map(({ x, s, ai, tc, dt }) => csvLine([x.t, s, (s / sFirst) * (firstOk?.N ?? 1), x.ok ? x.N : '', x.ok ? x.hkl.map(hklLabel).join('+') : '', ai, tc, dt, x.ok ? 'ok' : 'no']))].join('\n');
    out('table').innerHTML = `<h3>${esc(tpl(T.h_index, { t: typeName(best.type) }))}</h3>` + tableHTML('ix', head, rowsT, { cls: trs.map(({ x }) => [0, 0, 0, 0, 0, 0, 0, x.ok ? '' : 'bad', x.ok ? 'good' : 'bad']) })
      + `<p class="xrd-note">${esc(tpl(T.table_ix_note, { tol: fx(tol, 3) }))}</p>` + csvBtn('index');
    // ---- 図: a_i と Nelson–Riley 関数 ----
    const each = best.each ?? [];
    if (each.length >= 2) {
      const sm = small();
      const W = sm ? 360 : 640, Hh = sm ? 250 : 300, m = sm ? { l: 62, r: 10, t: 12, b: 38 } : { l: 70, r: 14, t: 14, b: 42 };
      const xk = fit === 'cs' ? 'cs' : 'nr', ext = fit === 'nr' || fit === 'cs';
      const xs = each.map(e => e[xk]), ys = each.map(e => e.a);
      const lineY = x => (ext ? fin.a + fin.slope * x : fin.a);
      const x1 = Math.max(...xs) * 1.08, ylo = Math.min(...ys, lineY(0), lineY(x1)), yhi = Math.max(...ys, lineY(0), lineY(x1)), pad = (yhi - ylo) * 0.15 || fin.a * 2e-4;
      const f = frame({ W, H: Hh, m, x0: 0, x1, y0: ylo - pad, y1: yhi + pad, xlabel: fit === 'cs' ? T.ax_cs : T.ax_nr, ylabel: T.ax_a, nx: sm ? 5 : 8, ny: 5, fs: sm ? 11 : 13 });
      const ln = `<path class="${ext ? 'fit' : 'dash'}" d="M${f.X(0).toFixed(1)},${f.Y(lineY(0)).toFixed(1)}L${f.X(x1).toFixed(1)},${f.Y(lineY(x1)).toFixed(1)}"/>`;
      const pts = each.map(e => `<circle class="pt" cx="${f.X(e[xk]).toFixed(1)}" cy="${f.Y(e.a).toFixed(1)}" r="4"><title>${esc(`${fx(e.t, 3)}°: a = ${fx(e.a, 5)} nm`)}</title></circle>`).join('');
      const a0 = `<circle class="pt2" cx="${f.X(0).toFixed(1)}" cy="${f.Y(lineY(0)).toFixed(1)}" r="5"/>`;
      out('chart').innerHTML = svgWrap(W, Hh, T.chart_nr, f.s + ln + pts + a0) + `<p class="xrd-note">${esc(ext ? T.chart_nr_note : T.chart_nr_note_lsq)}</p>`;
    } else out('chart').innerHTML = '';
    // ---- 途中の式 ----
    const li = [];
    li.push(tpl(T.ix_st1, { lam: fx(lam, 5) }));
    li.push(tpl(T.ix_st2, { list: trs.filter(r => r.x.ok).slice(0, 6).map(r => `${fx(r.s, 4)}`).join(', '), t: typeName(best.type), N: allowedN(best.type).slice(0, 8).join(', ') }));
    if (firstOk) { const ai = trs.find(r => r.x === firstOk).ai; li.push(tpl(T.ix_st3, { tt: fx(firstOk.t, 3), N: firstOk.N, lam: fx(lam, 5), th: fx(firstOk.t / 2, 4), a: fx(ai, 5) })); }
    li.push(fit === 'nr' || fit === 'cs' ? tpl(fit === 'cs' ? T.ix_st_cs : T.ix_st_nr, { a: fx(fin.a, 6), sa: fx(fin.sa, 6), b: fx(fin.slope, 6), r2: fx(fin.r2, 4) })
      : fit === 'lsqz' ? tpl(T.ix_st_lsqz, { a: fx(fin.a, 6), sa: fx(fin.sa, 6), z: fx(fin.z, 4), sz: fx(fin.sz, 4) })
      : tpl(T.ix_st_lsq, { a: fx(fin.a, 6), sa: fx(fin.sa, 6), rms: fx(fin.rms, 4) }));
    li.push(T.ix_st_judge);
    out('steps').innerHTML = `<h3>${esc(T.h_steps)}</h3><ol class="xrd-steps">${li.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  }

  // ================= 結晶子の大きさとひずみ =================
  function renderSize() {
    const lam = val('lambda', 0.005), K = val('K', 0.01), corr = el.corr.value, bi0 = val('binst', 0);
    const rows = parseRows(sz.value).filter(r => r.length >= 2).map(r => ({ tt: r[0], b: r[1], bi: r.length >= 3 ? r[2] : bi0 }));
    if (!rows.length) { out('summary').innerHTML = `<p class="xrd-warn">${esc(T.sz_few)}</p>`; out('chart').innerHTML = out('table').innerHTML = out('steps').innerHTML = ''; return; }
    const r = sizeStrain(rows, lam, K, corr);
    const good = r.pts.filter(p => p.ok);
    const meanD = good.length ? good.reduce((s, p) => s + p.D, 0) / good.length : NaN;
    const wh = r.wh;
    out('summary').innerHTML = stats([
      [T.sz_D_wh, wh && Number.isFinite(wh.D) ? `${fx(wh.D, 1)} nm` : '–'],
      [T.sz_eps, wh ? `${fx(wh.eps * 100, 3)} %` : '–'],
      [T.sz_D_sch, Number.isFinite(meanD) ? `${fx(meanD, 1)} nm` : '–'],
      [T.sz_r2, wh ? fx(wh.r2, 3) : '–'],
    ]) + (wh && !(wh.b0 > 0) ? `<p class="xrd-warn">${esc(T.sz_neg_int)}</p>` : '') + (wh && wh.b1 < 0 ? `<p class="xrd-warn">${esc(T.sz_neg_slope)}</p>` : '')
      + (r.pts.some(p => !p.ok) ? `<p class="xrd-warn">${esc(T.sz_bad)}</p>` : '')
      + (Number.isFinite(meanD) && meanD > 150 ? `<p class="xrd-note">${esc(T.sz_big)}</p>` : '');
    // 図: Williamson–Hall
    if (good.length >= 1) {
      const sm = small();
      const W = sm ? 360 : 640, Hh = sm ? 250 : 300, m = sm ? { l: 50, r: 10, t: 12, b: 38 } : { l: 58, r: 14, t: 14, b: 42 };
      const xs = good.map(p => p.x), ys = good.map(p => p.y * 1e3);
      const x1 = Math.max(...xs) * 1.1, yl = wh ? [wh.b0 * 1e3, (wh.b0 + wh.b1 * x1) * 1e3] : [];
      const y1 = Math.max(...ys, ...yl) * 1.15, y0 = Math.min(0, ...ys, ...yl);
      const f = frame({ W, H: Hh, m, x0: 0, x1, y0, y1, xlabel: T.ax_wh_x, ylabel: T.ax_wh_y, nx: sm ? 5 : 8, ny: 5, fs: sm ? 11 : 13 });
      const ln = wh ? `<path class="fit" d="M${f.X(0).toFixed(1)},${f.Y(yl[0]).toFixed(1)}L${f.X(x1).toFixed(1)},${f.Y(yl[1]).toFixed(1)}"/>` : '';
      const pts = good.map(p => `<circle class="pt" cx="${f.X(p.x).toFixed(1)}" cy="${f.Y(p.y * 1e3).toFixed(1)}" r="4"><title>${esc(`${fx(p.tt, 3)}°`)}</title></circle>`).join('');
      out('chart').innerHTML = svgWrap(W, Hh, T.chart_wh, f.s + ln + pts) + `<p class="xrd-note">${esc(T.chart_wh_note)}</p>`;
    } else out('chart').innerHTML = '';
    const head = [T.c_tt, T.c_bobs, T.c_binst, T.c_beta, T.c_cos, T.c_Dsch, T.c_eps1, '4 sinθ', 'β cosθ (×10⁻³)'];
    const rowsT = r.pts.map(p => [fx(p.tt, 3), fx(p.b, 3), fx(p.bi, 3), p.ok ? `${fx(p.bdeg, 4)}° = ${fx(p.beta * 1e3, 3)}×10⁻³` : '–', fx(Math.cos(p.th), 4), p.ok ? fx(p.D, 1) : '–', p.ok ? fx(p.eps * 100, 3) : '–', fx(p.x, 4), p.ok ? fx(p.y * 1e3, 4) : '–']);
    CSV.size = [csvLine(['2theta_deg', 'fwhm_obs_deg', 'fwhm_inst_deg', 'beta_deg', 'beta_rad', 'cos_theta', 'D_scherrer_nm', 'strain_single', '4sin_theta', 'beta_cos_theta']),
      ...r.pts.map(p => csvLine([p.tt, p.b, p.bi, p.ok ? p.bdeg : NaN, p.ok ? p.beta : NaN, Math.cos(p.th), p.ok ? p.D : NaN, p.ok ? p.eps : NaN, p.x, p.ok ? p.y : NaN]))].join('\n');
    out('table').innerHTML = `<h3>${esc(T.h_size)}</h3>` + tableHTML('sz', head, rowsT) + `<p class="xrd-note">${esc(T.table_sz_note)}</p>` + csvBtn('size');
    const li = [];
    const p0 = good[0];
    if (p0) {
      li.push(tpl(corr === 'gauss' ? T.sz_st_g : corr === 'lorentz' ? T.sz_st_l : T.sz_st_n, { tt: fx(p0.tt, 3), b: fx(p0.b, 3), bi: fx(p0.bi, 3), beta: fx(p0.bdeg, 4) }));
      li.push(tpl(T.sz_st_rad, { beta: fx(p0.bdeg, 4), rad: fx(p0.beta, 6) }));
      li.push(tpl(T.sz_st_sch, { K: fx(K, 3), lam: fx(lam, 5), rad: fx(p0.beta, 6), th: fx(p0.tt / 2, 3), cos: fx(Math.cos(p0.th), 4), D: fx(p0.D, 2) }));
    }
    if (wh) li.push(tpl(T.sz_st_wh, { A: fx(wh.b0 * 1e3, 4), B: fx(wh.b1, 5), K: fx(K, 3), lam: fx(lam, 5), D: fx(wh.D, 1), eps: fx(wh.eps * 100, 3) }));
    li.push(T.sz_st_note);
    out('steps').innerHTML = `<h3>${esc(T.h_steps)}</h3><ol class="xrd-steps">${li.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  }

  // ================= ピークの移動 =================
  function renderShift() {
    const lam = val('lambda', 0.005), p = simParams(), st = STRUCT[p.type];
    const H = Math.round(val('h')), K = Math.round(val('k')), L = Math.round(val('l'));
    const q = invD2(st.lat, p.a, p.c, H, K, L), d0 = q > 0 ? 1 / Math.sqrt(q) : NaN;
    const e = val('strain') / 100, sh = shiftOf(d0, lam, e);
    const tm = val('tm', 0), th0 = sh.t0 * RAD / 2, thm = tm * RAD / 2;
    const em = Math.sin(th0) / Math.sin(thm) - 1; // 測った 2θ からのひずみ
    const E = val('E', 0), nu = val('nu', 0.01);
    const sig = (-E * 1e3 * em) / (2 * nu); // MPa(E は GPa)
    // ベガード則
    const [nA, nB] = VEGARD[el.vg.value] ?? [T.v_a, T.v_b];
    const aA = val('va', 0.05), aB = val('vb', 0.05), N = Math.round(val('vh')) ** 2 + Math.round(val('vk')) ** 2 + Math.round(val('vl')) ** 2;
    const tv = val('tv', 0), am = N ? lam * Math.sqrt(N) / (2 * Math.sin(tv * RAD / 2)) : NaN, x = vegardX(am, aA, aB);
    const vhkl = hklLabel([Math.round(val('vh')), Math.round(val('vk')), Math.round(val('vl'))]);
    out('summary').innerHTML = `<h3>${esc(T.h_strain)}</h3>` + stats([
      [tpl(T.sh_t0, { hkl: hklLabel([H, K, L]) }), `${fx(sh.t0, 3)}°`],
      [tpl(T.sh_t1, { e: fx(e * 100, 3) }), `${fx(sh.t1, 3)}°`],
      [T.sh_dtt, `${fx(sh.exact, 4)}° (${T.sh_approx} ${fx(sh.approx, 4)}°)`],
      [tpl(T.sh_em, { tm: fx(tm, 3) }), `${fx(em * 100, 4)} %`],
      [T.sh_sig, `${fx(sig, 0)} MPa`],
    ]) + `<p class="xrd-note">${esc(T.sh_note)}</p>`
      + `<h3>${esc(T.h_vegard)}</h3>` + stats([
        [tpl(T.v_am, { hkl: vhkl, tv: fx(tv, 3) }), `${fx(am, 5)} nm`],
        [tpl(T.v_x, { b: fmtF(nB) }), Number.isFinite(x) ? `${fx(x * 100, 1)} %` : '–', x >= -0.02 && x <= 1.02 ? null : false],
        [T.v_sens, `${fx(Math.abs(-2 * Math.tan(tv * RAD / 2) * (aB - aA) / am * 0.01 / RAD), 4)}° / 1 %`],
      ]) + (x < -0.02 || x > 1.02 ? `<p class="xrd-warn">${esc(T.v_out)}</p>` : '') + `<p class="xrd-note">${esc(T.v_note)}</p>`;
    // 図: 組成と 2θ
    const sm = small();
    const W = sm ? 360 : 640, Hh = sm ? 250 : 300, m = sm ? { l: 54, r: 10, t: 12, b: 38 } : { l: 62, r: 14, t: 14, b: 42 };
    const ttx = xx => (N ? twoTheta(((1 - xx) * aA + xx * aB) / Math.sqrt(N), lam) : NaN);
    const curve = []; for (let i = 0; i <= 50; i++) curve.push([i / 50, ttx(i / 50)]);
    const ok = curve.filter(c => Number.isFinite(c[1]));
    if (ok.length > 1) {
      const ys = [...ok.map(c => c[1]), ...(Number.isFinite(tv) ? [tv] : [])];
      const y0 = Math.min(...ys), y1 = Math.max(...ys), pad = (y1 - y0) * 0.12 || 0.1;
      const f = frame({ W, H: Hh, m, x0: 0, x1: 100, y0: y0 - pad, y1: y1 + pad, xlabel: tpl(T.ax_x, { b: fmtF(nB) }), ylabel: tpl(T.ax_tt_hkl, { hkl: vhkl }), nx: 5, ny: 5, fs: sm ? 11 : 13 });
      const ln = `<path class="fit" d="${path(ok.map(([a, b]) => [a * 100, b]), f.X, f.Y)}"/>`;
      const pt = Number.isFinite(x) && x >= -0.05 && x <= 1.05 ? `<circle class="pt" cx="${f.X(x * 100).toFixed(1)}" cy="${f.Y(tv).toFixed(1)}" r="5"/><line class="dash" x1="${f.X(x * 100).toFixed(1)}" x2="${f.X(x * 100).toFixed(1)}" y1="${f.Y(tv).toFixed(1)}" y2="${f.Y(y0 - pad).toFixed(1)}"/>` : '';
      const ends = `<text font-size="${sm ? 11 : 12}" class="m" x="${f.X(0) + 4}" y="${m.t + 14}">${esc(fmtF(nA))}</text><text font-size="${sm ? 11 : 12}" class="m" x="${f.X(100) - 4}" y="${m.t + 14}" text-anchor="end">${esc(fmtF(nB))}</text>`;
      out('chart').innerHTML = svgWrap(W, Hh, T.chart_vegard, f.s + ln + pt + ends) + `<p class="xrd-note">${esc(T.chart_vegard_note)}</p>`;
    } else out('chart').innerHTML = `<p class="xrd-warn">${esc(T.no_peak)}</p>`;
    // 表: 組成ごとの a と 2θ
    const xsT = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const rowsT = xsT.map(xx => [`${fx(xx * 100, 0)} %`, fx((1 - xx) * aA + xx * aB, 5), fx(ttx(xx), 3)]);
    CSV.shift = [csvLine(['x_B', 'a_nm', `2theta_${vhkl}_deg`]), ...xsT.map(xx => csvLine([xx, (1 - xx) * aA + xx * aB, ttx(xx)]))].join('\n');
    out('table').innerHTML = `<h3>${esc(tpl(T.h_vtable, { hkl: vhkl }))}</h3>` + tableHTML('vg', [tpl(T.c_x, { b: fmtF(nB) }), T.c_a, T.c_tt], rowsT) + csvBtn('shift');
    const li = [
      tpl(T.sh_st1, { hkl: hklLabel([H, K, L]), d: fx(d0, 5), tt: fx(sh.t0, 4) }),
      tpl(T.sh_st2, { e: fx(e * 100, 3), d: fx(d0 * (1 + e), 6), tt: fx(sh.t1, 4), dtt: fx(sh.exact, 4) }),
      tpl(T.sh_st3, { e: fx(e, 5), th: fx(sh.t0 / 2, 3), tan: fx(Math.tan(th0), 4), approx: fx(sh.approx, 4) }),
      tpl(T.sh_st4, { th0: fx(sh.t0 / 2, 4), thm: fx(tm / 2, 4), em: fx(em, 6) }),
      tpl(T.sh_st5, { E: fx(E, 1), nu: fx(nu, 3), em: fx(em, 6), sig: fx(sig, 0) }),
      tpl(T.v_st1, { lam: fx(lam, 5), N, tv: fx(tv, 3), am: fx(am, 5) }),
      tpl(T.v_st2, { am: fx(am, 5), aA: fx(aA, 5), aB: fx(aB, 5), x: fx(x, 4) }),
    ];
    out('steps').innerHTML = `<h3>${esc(T.h_steps)}</h3><ol class="xrd-steps">${li.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`;
  }

  // ---- 画面の切り替え ----
  function layout() {
    const mode = MODES.includes(el.mode.value) ? el.mode.value : 'sim';
    for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    const st = STRUCT[el.type.value];
    for (const [name, modes] of Object.entries(SHOW)) {
      const lab = el[name]?.closest('label');
      if (!lab) continue;
      let show = modes.split(' ').includes(mode);
      if (name === 'c') show &&= st.lat === 'hex';
      if (name === 'u') show &&= el.type.value === 'wurtzite';
      if (name === 'eb') show &&= !!st.two;
      lab.hidden = !show;
    }
    for (const p of subs) p.hidden = !p.dataset.modes.split(' ').includes(mode);
    pkWrap.hidden = mode !== 'index'; szWrap.hidden = mode !== 'size';
    // ラベルの文字: 2種類の原子の構造では「原子 A・B」
    el.ea.closest('label').querySelector('span').textContent = st.two ? T.ea2 : T.ea1;
    return mode;
  }
  let lastKey = '';
  function update() {
    const mode = layout();
    const key = [...el].filter(x => x.name).map(x => x.value).join('|') + small();
    if (key === lastKey) return;
    lastKey = key;
    CSV = {};
    if (mode === 'sim') renderSim();
    else if (mode === 'index') renderIndex();
    else if (mode === 'size') renderSize();
    else renderShift();
  }
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('submit', e => e.preventDefault());
  if (window.ResizeObserver) new ResizeObserver(() => update()).observe(out('chart'));
  update();
  syncUrl();
}
