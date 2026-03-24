function getParentContainer() {
	var parentContainer = document.querySelector('#parentContainer');
	
	if (parentContainer === null) {
		var oldPanoramaContainer = document.querySelector('#panorama-container');
		var parentContainer = document.createElement('div');
		parentContainer.id = 'parentContainer';
		oldPanoramaContainer.parentElement.insertBefore(parentContainer, oldPanoramaContainer);
		parentContainer.appendChild(oldPanoramaContainer);
	}
	
	return parentContainer;
}

const $panoramaContainer = document.querySelector('#panorama-container');
const $parentContainer = getParentContainer();

const mutationObservers = getObservers();
let panoramaWidth = $panoramaContainer.getBoundingClientRect().width;

const appVersion= '10-07-2019';

console.log(` PanoramaEditor -${appVersion}`);

window.addEventListener('resize', function() {
  panoramaWidth = $panoramaContainer.getBoundingClientRect().width;
  let height = window.innerHeight;
  $panoramaContainer.style.height=`${height}px`;
  $parentContainer.style.height=`${height}px`;
});

fetch(addTimestampToUrl(configPath), {credentials: "same-origin"})
  .then(function (response) {
    return (document.automationTestsJSON ? document.automationTestsJSON.json() : response.json())
  })
  .then(function(config) {
    if (Object.getOwnPropertyNames(config).length === 0) {
      return;
    }

    config.autoLoad = true;
    isImagePanorama = !config.videoSrc;

    if (isImagePanorama) {
      loadImagePanorama($panoramaContainer, config);
    } else {
      loadVideoPanorama($panoramaContainer, config);
    }
  });

/**
* Init Image Panorama Viewer.
* @param { object } $container - panorama container selection
* @param { object } config - panorama config
*/
function loadImagePanorama($container, config) {
  const scenes = config.scenes;
  const scenesName = Object.keys(scenes);
  const imageTemplate = '<div id="panorama"></div>';
  const configWithoutShape = {
    scenes: {}
  };
  const shapeConfig = {};

  $container.insertAdjacentHTML('beforeend', imageTemplate);
  scenesName.forEach(function(sceneName) {
    setCustomHotspotClass(scenes[sceneName].hotSpots);
    addHandlersToHotSpots(scenes[sceneName].hotSpots);
    addHoverTextToHotSpots(scenes[sceneName].hotSpots);
  });
  separateImageConfig();
  const viewer = pannellum.viewer('panorama', configWithoutShape);
  const initialScene = viewer.getScene();

  if (scenes[initialScene].type === 'multires') {
    drawHotspots();
  }

  viewer.on('load', function(scene) {
    drawHotspots();
  });

  function drawHotspots() {
    const currentScene = viewer.getScene();

    customizeHotSpots(scenes[currentScene].hotSpots);
    mutationObservers.unsubscribeFromAll();
    if (shapeConfig[currentScene]) {
      shapeConfig[currentScene].forEach(function(hotSpot) {
        if (hotSpot.shape && hotSpot.shape.drawPoints) {
          addShape(viewer, hotSpot);
        }
      });
    }
  }

  function separateImageConfig() {
    const configProps = Object.keys(config);

    configProps.forEach(function(prop) {
      if (prop !== 'scenes') {
        configWithoutShape[prop] = config[prop];
      } else {
        scenesName.forEach(function(sceneName) {
          const sceneProps = Object.keys(scenes[sceneName]);
          const sceneNameObject = configWithoutShape.scenes[sceneName] = {};

          sceneProps.forEach(function(prop) {
            if (prop !== 'hotSpots') {
              sceneNameObject[prop] = scenes[sceneName][prop];
            } else {
              sceneNameObject[prop] = [];
            }
          });

          scenes[sceneName].hotSpots.forEach(function(hotSpot) {
            if (hotSpot.shape) {
              if (!shapeConfig[sceneName]) {
                shapeConfig[sceneName] = [ hotSpot ];
              } else {
                shapeConfig[sceneName].push(hotSpot);
              }
            } else {
              sceneNameObject.hotSpots.push(hotSpot);
            }
          });
        });
      }
    });
  }
}

function getObservers() {
  let observers = {};

  function unsubscribeFromAll() {
    Object.keys(observers).forEach(function(id) {
      observers[id].disconnect();
    });

    observers = {};
  }

  function unsubscribe(id) {
    if (!observers[id]) {
      return;
    }

    observers[id].disconnect();
    delete observers[id];
  }

  function addObserver(el, id, callback) {
    const transformObserver = new MutationObserver(callback);
    const mutationConfig = { attributes: true, childList: false, subtree: false };

    observers[id] = transformObserver;
    transformObserver.observe(el, mutationConfig);
  }

  return {
    unsubscribeFromAll: unsubscribeFromAll,
    unsubscribe: unsubscribe,
    addObserver: addObserver
  };
}

/**
* Init Video Panorama Viewer.
* @param { object } $container - panorama container selection
* @param { object } config - panorama config
*/
function loadVideoPanorama($container, config) {
  const videoTemplate =
    '<video id="panorama" ' +
        'class="video-js vjs-default-skin vjs-big-play-centered" ' +
        'controls ' +
        'preload="none" ' +
        'style="width:100%;" ' +
        'poster="' + config.poster + '" ' +
        'crossorigin="anonymous"> ' +
        getSource(config.videoSrc, 'video/mp4') + ' ' +
      '<p class="vjs-no-js"> ' +
        'To view this video please enable JavaScript, and consider upgrading to a web browser that ' +
        '<a href="http://videojs.com/html5-video-support/" target="_blank">supports HTML5 video</a> ' +
      '</p> ' +
    '</video> ';
  const plugins = config.plugins;
  setCustomHotspotClass(plugins.pannellum.hotSpots);
  addHandlersToHotSpots(plugins.pannellum.hotSpots);
  addHoverTextToHotSpots(plugins.pannellum.hotSpots);
  let allHotSpots = plugins.pannellum.hotSpots.map(function(hotSpot) {
    return hotSpot;
  });

  plugins.pannellum.hotSpots = allHotSpots.filter(function(hotspot) {
    return isDefaultHotspot(hotspot) && !isShapeHotspot(hotspot);
  });
  const hotSpots = allHotSpots.filter(function(hotspot) {
    return !isDefaultHotspot(hotspot);
  });
  const shapeHotSpots = allHotSpots.filter(function(hotspot) {
    return isDefaultHotspot(hotspot) && isShapeHotspot(hotspot);
  });
  $container.insertAdjacentHTML('beforeend', videoTemplate);

  const videoPlayer = videojs('panorama', {
    autoplay: true,
    plugins: plugins
  });
  const pnlmViewer = videoPlayer.pnlmViewer;
  const visibleHotSpots = [];

  setEventHandlers();

  /**
   * Add pannellum and videojs event handlers.
   */
  function setEventHandlers() {
    videoPlayer.on('timeupdate', function () {
      const currentTime = this.currentTime();

      hotSpots.forEach(function(hotSpot) {
        const hotSpotsIndex = visibleHotSpots.indexOf(hotSpot.id);

        if (hotSpot.startTime < currentTime && currentTime < hotSpot.endTime) {
          if (hotSpotsIndex === -1) {
            visibleHotSpots.push(hotSpot.id);
            if (hotSpot.shape) {
              addShape(pnlmViewer, hotSpot);
            } else {
              pnlmViewer.addHotSpot(hotSpot);
              customizeHotSpots([hotSpot]);
            }
          }
        } else if (hotSpotsIndex !== -1) {
          if (hotSpot.shape) {
            const shapeHotSpots = $panoramaContainer.querySelectorAll('.' + hotSpot.id);

            mutationObservers.unsubscribe(hotSpot.id);

            for (let prop in shapeHotSpots) {
              if (shapeHotSpots.hasOwnProperty(prop)) {
                shapeHotSpots[prop].remove();
              }
            }
          } else {
            pnlmViewer.removeHotSpot(hotSpot.id);
          }
          visibleHotSpots.splice(hotSpotsIndex, 1);
        }
      });
    });

    pnlmViewer.on('load', function() {
      customizeHotSpots(plugins.pannellum.hotSpots);
      shapeHotSpots.forEach(function(hotSpot) {
        if (hotSpot.shape) {
          addShape(pnlmViewer, hotSpot);
        }
      });
    });
  }

  function isShapeHotspot(hotspot) {
    return hotspot.shape;
  }

  /**
   * Detect default hotspots.
   * @param { Object } hotspot
   */
  function isDefaultHotspot(hotspot) {
    return hotspot.startTime === undefined || hotspot.endTime === undefined;
  }

  /**
  * Returns correсt source according to a source type in config object.
  * @param { string } src - video src
  * @param { string } type - type of video file
  */
  function getSource(src, type) {
    return !!src ? '<source src="' + src + '" type="'+ type + '"/>' : '';
  }
}

/**
 * Set cssClass property in config.
 * @param { object } hotSpots
 */
function setCustomHotspotClass(hotSpots) {
  hotSpots.map(function(hotSpot) {
    if (hotSpot.id && hotSpot.iconPath) {
      hotSpot.cssClass = 'custom-hotspot ' + hotSpot.id;
    }});
}

/**
 * Set css backgrount-image to custom hotspot.
 * @param { object } hotSpots
 */
function customizeHotSpots(hotSpots) {
  hotSpots.forEach(function(hotSpot) {
    const hotspotEl = $panoramaContainer.querySelector('.' + hotSpot.id);
    if (hotSpot.iconPath && hotspotEl) {
      hotspotImgEdit(hotspotEl, hotSpot.iconPath);
    }
  });
}

/**
* Trigger broadcastMessage method with message as an argument.
* @param { Event } event - event
* @param { object } clickHandlerArgs
*/
function myMessage(event, clickHandlerArgs) {
  if (typeof document.broadcastMessage !== 'function') return;
  console.log("broadcastMessage-"+clickHandlerArgs.message);
  document.broadcastMessage(clickHandlerArgs.message);
}

/**
* Trigger broadcastMessage method with id as an argument.
* @param { Event } event - event
* @param { object } clickHandlerArgs
*/
function goToItem(event, clickHandlerArgs) {
  if (typeof document.broadcastExecuteAction !== 'function') return;
  console.log("broadcastExecuteAction-"+"goItem - target " + clickHandlerArgs.id);
  document.broadcastExecuteAction("goItem", {"target": clickHandlerArgs.id});
}

/**
 * Add clickHandlerFunc and ClickHandlerArgs to each hotSpot.
 * @param { Array } hotSpots
 */
function addHandlersToHotSpots(hotSpots) {
  hotSpots.forEach(function(hotSpot) {
    addHandlers(hotSpot);
    if (hotSpot.shape && hotSpot.shape.drawPoints) {
      copyProperties(hotSpot);
    }
  });
}

/**
 * Add hotSpot.text for pannellum tooltip.
 * @param { Array } hotSpots
 */
function addHoverTextToHotSpots(hotSpots) {
  let head = document.head;
  let style = document.createElement('style');
  style.type = 'text/css';
  let css='';
  hotSpots.map(function (hotSpot) {
    if (hotSpot.title) {
      hotSpot.text = hotSpot.title;
      if (!hotSpot.cssClass) {
        hotSpot.cssClass = ` pnlm-hotspot pnlm-sprite  ${hotSpot.id}`;
        if (hotSpot.type === 'info') {
          hotSpot.cssClass += ` pnlm-info`;
        } else if (hotSpot.type === 'scene') {
          hotSpot.cssClass += ` pnlm-scene`;
        }
      }
      let color = hotSpot.tooltipColor?`rgb(${hotSpot.tooltipColor.r}, ${hotSpot.tooltipColor.g}, ${hotSpot.tooltipColor.b},1)`: `rgb(255, 255,255)`;
      css += ` .${hotSpot.id}:hover span:after {border-color: ${color} transparent transparent transparent!important;} .${hotSpot.id} span{background:${color}!important;} `;
      head.appendChild(style);
      style.appendChild(document.createTextNode(css));
    }
  });
}

function copyProperties(hotSpot) {
  for (let prop in hotSpot) {
    if (prop !== 'shape' && !hotSpot.shape.drawPoints[0][prop] && hotSpot.hasOwnProperty(prop)) {
      hotSpot.shape.drawPoints[0][prop] = hotSpot[prop];
    }
  }
}

function addHandlers(hotSpot) {
  switch (hotSpot.typeCopy) {
    case 'User Message':
      hotSpot.clickHandlerFunc = myMessage;
      hotSpot.clickHandlerArgs = { message: hotSpot.eventName };
      break;
    case 'Course Page':
      hotSpot.clickHandlerFunc = goToItem;
      if(hotSpot.targetPage){
        hotSpot.clickHandlerArgs = { id: hotSpot.targetPage[0] };
      }
      break;
    default:
      break;
  }
}

/**
 * Generate a timestamp.
 * @returns { number }
 */
function generateTimestamp() {
  return + new Date();
}

/**
 * Add a timestamp to the url.
 * @param { string } url
 * @returns { string }
 */
function addTimestampToUrl(url) {
  const timestamp = 'timestamp=' + generateTimestamp();

  url += url.indexOf('?') !== -1 ? '&' + timestamp : '?' + timestamp;

  return url;
}

/**
 * Returns svg of the shape.
 * @param { Object } shape
 * @returns { string }
 */
function getSvg(shape) {
  const drawPoints = document.querySelectorAll('.draw-point.' + shape.drawPoints[0].id);
  const defaultPointCoordinates = drawPoints[0].getBoundingClientRect();
  const x = defaultPointCoordinates.left;
  const y = defaultPointCoordinates.top;
  let pointsString = '';
  let minX, maxX, minY, maxY;

  for(let prop in drawPoints) {
    if (!drawPoints.hasOwnProperty(prop)) {
      continue;
    }
    const pointEl = document.querySelector('.draw-point.' + shape.drawPoints[0].id + '.point-'+ prop);
    const pointCoordinates = pointEl.getBoundingClientRect();
    pointEl.style.visibility = 'visible';
    minX = !minX || minX > pointCoordinates.left ? pointCoordinates.left : minX;
    minY = !minY || minY > pointCoordinates.top ? pointCoordinates.top : minY;
    maxX = !maxX || maxX < pointCoordinates.left ? pointCoordinates.left : maxX;
    maxY = !maxY || maxY < pointCoordinates.top ? pointCoordinates.top : maxY;
  }

  for(let prop in drawPoints) {
    if (!drawPoints.hasOwnProperty(prop)) {
      continue;
    }
    const pointEl = document.querySelector('.draw-point.' + shape.drawPoints[0].id + '.point-' + prop);
    const pointCoordinates = pointEl.getBoundingClientRect();
    if (pointCoordinates.left + 200 < 0 || pointCoordinates.left > panoramaWidth + 200) {
      continue;
    }
    pointsString += (pointCoordinates.left - minX) + ',' + (pointCoordinates.top - minY) + ' ';
  }
  pointsString = pointsString.slice(0, -1);

  const width = 'width="' + (maxX - minX) + '"';
  const height = 'height="' + (maxY - minY) + '"';
  const transform = 'transform="translate(' + (minX - x) + ', ' + (minY - y) + ')"';
  const points = 'points="' + pointsString + '"';
  const fill = 'fill: ' + getColor(shape.fillColor) + ';';
  const stroke = 'stroke: ' + getColor(shape.conturColor) + ';';
  let svg = '<svg ' + height + ' ' + width + ' ' + transform + '>' +
    '<polygon ' + points + ' style="' + fill + stroke + 'stroke-width:1"/>' +
    '</svg>';

  return {svg: svg, X:x, Y:y}
}

/**
 * Add point to viewer.
 * @param { Object } pnlmViewer
 * @param { Object } shape
 */
function addPoint(pnlmViewer, hotSpot) {
  const hotspotEl = $panoramaContainer.querySelector('.shape.' + hotSpot.shape.drawPoints[0].id);

  if (!hotspotEl) {
    hotSpot.shape.drawPoints.forEach(function(point, index, points) {
      point.cssClass = 'draw-point ' + points[0].id + ' ' + 'point-' + index;
      if (index === 0) {
        point.cssClass += ' shape';
      }
      pnlmViewer.addHotSpot(point);
    });
  }
}

/**
 * Add shape hotspot to viewer.
 * @param { Object } pnlmViewer
 * @param { Object } shape
 */
function addShape(pnlmViewer, hotSpot) {
  addPoint(pnlmViewer, hotSpot);

  const hotspotEl = $panoramaContainer.querySelector('.shape.' + hotSpot.shape.drawPoints[0].id);
  hotspotEl.classList.add('shape-tooltip');
  const observerCallback = function() {
    const svgProps = getSvg(hotSpot.shape);
    if(svgProps) {
      hotspotEl.innerHTML = svgProps.svg;
    }
    handleShapeTooltip(hotSpot,hotspotEl);
  };

  hotspotEl.innerHTML = getSvg(hotSpot.shape).svg;
  handleShapeTooltip(hotSpot,hotspotEl);
  mutationObservers.addObserver(hotspotEl, hotSpot.id, observerCallback);
}
/**
 * Add tooltip  to shape hotSpot.
 * @param { hotspotEl } hotSpotDiv
 * @returns { hotSpot } object
 */
function handleShapeTooltip(hotSpot, hotspotEl) {
  if (hotSpot.title) {
    let span = document.createElement('span');
    span.innerHTML = hotSpot.title;
    let color = hotSpot.tooltipColor ? `rgb(${hotSpot.tooltipColor.r}, ${hotSpot.tooltipColor.g}, ${hotSpot.tooltipColor.b},1)` : `rgb(255, 255, 255)`;
    span.style.backgroundColor = color;
    hotspotEl.appendChild(span);
    let tooltipArrow = 12;
    let spanWidth = span.getBoundingClientRect().width / 2;
    let spanHeight = span.getBoundingClientRect().height / 2 + tooltipArrow;
    hotspotEl.onmouseover = function (e) {
      const svgProps = getSvg(hotSpot.shape);

      let x = e.clientX - svgProps.X - spanWidth;
      let y = e.clientY - svgProps.Y - spanHeight;
      span.style.top = (y) + 'px';
      span.style.left = (x) + 'px';
    };
  }
}

/**
 * Add fullSize image to custom hotSpot.
 * @param { Element } hotSpotDiv
 * @returns { string } imgSrc
 */
function hotspotImgEdit(hotSpotDiv, imgSrc) {
  hotSpotDiv.classList.add('custom-tooltip');
  const img = findImageParams(imgSrc);
  img.then((res) => {
    const prevHotspotElCoordinates = hotSpotDiv.getBoundingClientRect();
    let span = hotSpotDiv.querySelector('span');
    if (span) {
      span.removeAttribute('style');
      let imageWidth = res.width;
      let imageHeight = res.height;
      let right;
      let spanWidth = span.getBoundingClientRect().width;
      if (spanWidth > imageWidth) {
        right = (spanWidth - imageWidth) / 2 * -1;
      } else {
        right = (imageWidth - spanWidth) / 2;
      }
      span.setAttribute('style', `bottom :${imageHeight + 10}px!important; right:${right}px`);
    }
    hotSpotDiv.style.width = `${res.width}px`;
    hotSpotDiv.style.height = `${res.height}px`;
    const container = $panoramaContainer.getBoundingClientRect();
    const hotspotElCoordinates = hotSpotDiv.getBoundingClientRect();
    const posX = Math.round(hotspotElCoordinates.top - container.top - hotspotElCoordinates.height / 2 + prevHotspotElCoordinates.height / 2);
    const posY = Math.round(hotspotElCoordinates.left - container.left - hotspotElCoordinates.width / 2 + prevHotspotElCoordinates.width / 2);
    hotSpotDiv.style.transform = `translate(${posY}px, ${posX}px)`;

    var HotspotImage = document.createElement('img');
    HotspotImage.src = imgSrc;
    hotSpotDiv.appendChild(HotspotImage);
  })
}

/**
 * Returns color in rgba format.
 * @param { Object } color
 * @returns { string }
 */
function getColor(color) {
  return 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + color.a + ')';
}

function findImageParams(imgSrc) {
  return new Promise((res) => {
    const img = new Image();
    img.src = imgSrc;
    img.onload = function () {
      res({'width': img.width, 'height': img.height})
    }
  })
}
