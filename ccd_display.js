var uiUtils =require('users/zhaotingting/toolkit:Toolkit_JS/ui');
// Set default ccd params
var BPBANDS = ['GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2'];
var TMBANDS = ['GREEN', 'SWIR2'];
var chart_type=['Time series','DOY']
var dateFormat=1
var lambda=0.002
var iteration=10000
//var bandSelect = 'NIR'
var observation=5
var defaultCcdParams = {   
    breakpointBands: BPBANDS,
    tmaskBands: TMBANDS,
    dateFormat: dateFormat,
    lambda: lambda,
    maxIterations: iteration
  }
var defaultRunParams = {sDate: '2000-01-01', eDate:'2020-01-01',bandSelect:'BLUE', nSegs: 6}
var defaultVizParams = {red: 'SWIR1', green: 'NIR', blue: 'RED', 
                        redMin: 0, redMax: 0.6, 
                        greenMin: 0, greenMax: 0.6, 
                        blueMin: 0, blueMax: 0.6}
/**CCD TS surface
 * */
exports.ccddisp_button = function (Lambda_in,iteration_in,start_Date,end_Date,bandSelect,
    observation_in,chart_type_select,ccdParams, runParams, vizParams,mapObj,Panel,clicklayer){
          
  ccdParams = ccdParams || defaultCcdParams
  runParams = runParams || defaultRunParams
  vizParams = vizParams || defaultVizParams
  
  var waitMsg = ui.Label({
    value: 'Processing, please wait',
    style: {
      position: 'bottom-left',
      stretch: 'horizontal',
      textAlign: 'center',
      fontWeight: 'bold',
      backgroundColor: 'rgba(255, 255, 255, 0.0)'
    }
  });
  var chartPanel = ui.Panel({
    style: {
      position: 'bottom-center',
      padding: '0px',
      margin: '0px',
      border: '0px',
      // whiteSpace:'nowrap',
      stretch: 'both',
      backgroundColor: 'rgba(255, 255, 255, 0.5)'
    } 
  });
  var mapCallback = function(coords) {
    //print(mapObj.layers())
    var lengths =(ee.Number(mapObj.layers().length()).subtract(1)).getInfo()
    if(lengths !== -1){
      var clicklayer_name = mapObj.layers().get(lengths).getName()
      if(clicklayer_name == 'clicked'){
        clicklayer= mapObj.layers().get(lengths)
      }else{
        clicklayer =null
      }
    }
    //print(clicklayer)
    //Re-set runParams and ccdParams
    ccdParams['lambda'] = Lambda_in.getValue()
    ccdParams['maxIterations'] = iteration_in.getValue()
    runParams['sDate'] = start_Date.getValue()
    runParams['eDate'] = end_Date.getValue()
    runParams['bandSelect'] = bandSelect.getValue()
    runParams['nSegs'] = observation_in.getValue()
    var charttype = chart_type_select.getValue()
    if(dirtyMap === false){
      //mapObj.widgets().set(1, chartPanel)
      dirtyMap = true;
    }
    chartPanel.clear();
    chartPanel.add(waitMsg);
    var geometry = ee.Geometry.Point([coords.lon, coords.lat])
    if (charttype == "Time series"){
      uiUtils.chartCcdc(ccdParams, runParams, vizParams, geometry, chartPanel, 
                coords.lat, coords.lon, mapObj,clicklayer)
    } else if (charttype == "DOY") {
      uiUtils.chartDOY(runParams, mapObj, geometry, chartPanel,coords.lat, coords.lon,clicklayer)
    }  
  }
  var dirtyMap = false
  mapObj.onClick(mapCallback) 
  mapObj.setOptions('SATELLITE');
  mapObj.setControlVisibility({zoomControl:false, layerList:true});
  mapObj.style().set({cursor:'crosshair'});
  return Panel.widgets().add(chartPanel)
}
  

exports.ccdlayer = function(ccdParams, runParams, vizParams,vali_index,
        vali_list,charttype,mapObj,start_date,end_date,select_band){
          
  var ccd_txt=ui.Label({
    value:"CCD visualization",
    style:{stretch: 'horizontal',fontWeight: "bold",color:'white',
          fontSize: "14px",padding: '1px',backgroundColor:'black',height:'20px'}
  })
  var sDatetxt=ui.Label({
    value:"Start date",
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var start_Date = ui.Textbox({
    placeholder: 'Start Date',
    value:'1983-01-01',
    style:{stretch: 'horizontal', backgroundColor: 'rgba(255, 255, 255, 0.0)'}
  })
  var eDatetxt=ui.Label({
    value:"End date",
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var end_Date = ui.Textbox({
    placeholder: 'End Date',
    value:'2022-01-01',
    style:{stretch: 'horizontal', backgroundColor: 'rgba(255, 255, 255, 0.0)'}
  })
  var bandselecttxt=ui.Label({
    value:"Select band",
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var bandSelect = ui.Select({items:BANDS, value:'SWIR1',
                   style:{stretch: 'horizontal', backgroundColor: 'rgba(255, 255, 255, 0.0)'}
  })
  var chart_typetxt=ui.Label({
    value:"Chart type",
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var chart_type_select = ui.Select({items:chart_type, value:'Time series',
                   style:{stretch: 'horizontal', backgroundColor: 'rgba(255, 255, 255, 0.0)'}
  })
  var Lambda_txt=ui.Label({
    value:'Lambda',
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var Lambda_in=ui.Textbox({
    placeholder:"",
    value:0.002,
    style:{stretch: 'horizontal',
    fontWeight: "bold",fontSize: "8px"}
  });
  var iteration_txt=ui.Label({
    value:'Max iterations',
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var iteration_in=ui.Textbox({
    placeholder:"",
    value:10000,
    style:{stretch: 'horizontal',
    fontWeight: "bold",fontSize: "8px"}
  });
  var observation_txt=ui.Label({
    value:'Min num of observation',
    style:{fontWeight: "bold",fontSize: "8px",padding: '1px'}
  })
  var observation_in=ui.Textbox({
    placeholder:"",
    value:6,
    style:{stretch: 'horizontal',
    fontWeight: "bold",fontSize: "8px"}
  });
  
  var clear_button = ui.Button({
    label: "Clear!",
    onClick:function(){
                        mapObj.clear()
                        //mapObj.widgets().set(0, ccd_seriespanel);
                        // Need to restablish callback after map.clear
                        //dirtyMap = false
                        //mapObj.setControlVisibility({zoomControl:false, layerList:true})
                      },
    style:{stretch: 'horizontal',
    fontWeight: "bold",fontSize: "6px"}
  })
  var ccd_seriespanel = ui.Panel({
    widgets:[ccd_txt,ui.Panel({
      widgets:[sDatetxt,start_Date],layout:ui.Panel.Layout.flow('horizontal')
    }),ui.Panel({
      widgets:[eDatetxt,end_Date],layout:ui.Panel.Layout.flow('horizontal')
    }),ui.Panel({
      widgets:[bandselecttxt,bandSelect],layout:ui.Panel.Layout.flow('horizontal')
    }),ui.Panel({
      widgets:[Lambda_txt,Lambda_in],layout:ui.Panel.Layout.flow('horizontal')
    }),ui.Panel({
      widgets:[iteration_txt,iteration_in],layout:ui.Panel.Layout.flow('horizontal')
    }),ui.Panel({
      widgets:[observation_txt,observation_in],layout:ui.Panel.Layout.flow('horizontal')
    }),ui.Panel({
      widgets:[chart_typetxt,chart_type_select],layout:ui.Panel.Layout.flow('horizontal')
    }),clear_button], 
    style:{stretch: 'vertical', 
    position: 'bottom-right'},
    layout:ui.Panel.Layout.flow('vertical')
  })
  return ccd_seriespanel
}
