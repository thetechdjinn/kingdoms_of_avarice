/**
 * Cross-Connections — 10 rooms + inter-section exits.
 * Rooms on the hub line between section junctions.
 * Also contains all cross-section exit definitions.
 */
import { DistrictData } from '../../arindale/types.js';
import { sewerDescription, maybeAddSewerDetail } from '../descriptions.js';

function desc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('cross', tag), tag);
}

export function getCrossConnections(): DistrictData {
  return {
    rooms: [
      {
        tag: 'sewer_cross_1',
        name: 'Connecting Passage',
        description: desc('sewer_cross_1'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_2',
        name: 'Sewer Tunnel',
        description: desc('sewer_cross_2'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_3',
        name: 'Wide Tunnel',
        description: desc('sewer_cross_3'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_4',
        name: 'Connecting Passage',
        description: desc('sewer_cross_4'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_5',
        name: 'Sewer Tunnel',
        description: desc('sewer_cross_5'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_6',
        name: 'Wide Tunnel',
        description: desc('sewer_cross_6'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_7',
        name: 'Connecting Passage',
        description: desc('sewer_cross_7'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_8',
        name: 'Sewer Tunnel',
        description: desc('sewer_cross_8'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_9',
        name: 'Wide Tunnel',
        description: desc('sewer_cross_9'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_cross_10',
        name: 'Sewer Tunnel',
        description: desc('sewer_cross_10'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
    ],

    exits: [
      { fromTag: 'sewer_north_48', toTag: 'sewer_entrance_warrens', direction: 'east' },
      { fromTag: 'sewer_entrance_warrens', toTag: 'sewer_north_48', direction: 'west' },
      { fromTag: 'sewer_west_junction', toTag: 'sewer_cross_1', direction: 'east' },
      { fromTag: 'sewer_cross_1', toTag: 'sewer_west_junction', direction: 'west' },
      { fromTag: 'sewer_cross_1', toTag: 'sewer_cross_2', direction: 'east' },
      { fromTag: 'sewer_cross_2', toTag: 'sewer_cross_1', direction: 'west' },
      { fromTag: 'sewer_cross_2', toTag: 'sewer_cross_3', direction: 'east' },
      { fromTag: 'sewer_cross_3', toTag: 'sewer_cross_2', direction: 'west' },
      { fromTag: 'sewer_cross_3', toTag: 'sewer_central_hub', direction: 'east' },
      { fromTag: 'sewer_central_hub', toTag: 'sewer_cross_3', direction: 'west' },
      { fromTag: 'sewer_central_hub', toTag: 'sewer_cross_4', direction: 'east' },
      { fromTag: 'sewer_cross_4', toTag: 'sewer_central_hub', direction: 'west' },
      { fromTag: 'sewer_cross_4', toTag: 'sewer_cross_5', direction: 'east' },
      { fromTag: 'sewer_cross_5', toTag: 'sewer_cross_4', direction: 'west' },
      { fromTag: 'sewer_cross_5', toTag: 'sewer_cross_6', direction: 'east' },
      { fromTag: 'sewer_cross_6', toTag: 'sewer_cross_5', direction: 'west' },
      { fromTag: 'sewer_cross_6', toTag: 'sewer_east_junction', direction: 'east' },
      { fromTag: 'sewer_east_junction', toTag: 'sewer_cross_6', direction: 'west' },
      { fromTag: 'sewer_east_junction', toTag: 'sewer_cross_7', direction: 'east' },
      { fromTag: 'sewer_cross_7', toTag: 'sewer_east_junction', direction: 'west' },
      { fromTag: 'sewer_cross_7', toTag: 'sewer_east_hub', direction: 'east' },
      { fromTag: 'sewer_east_hub', toTag: 'sewer_cross_7', direction: 'west' },
      { fromTag: 'sewer_cross_8', toTag: 'sewer_cross_9', direction: 'east' },
      { fromTag: 'sewer_cross_9', toTag: 'sewer_cross_8', direction: 'west' },
      { fromTag: 'sewer_cross_9', toTag: 'sewer_cross_10', direction: 'east' },
      { fromTag: 'sewer_cross_10', toTag: 'sewer_cross_9', direction: 'west' },
      { fromTag: 'sewer_west_6', toTag: 'sewer_central_4', direction: 'east' },
      { fromTag: 'sewer_central_4', toTag: 'sewer_west_6', direction: 'west' },
      { fromTag: 'sewer_east_27', toTag: 'sewer_east_road_exit', direction: 'east' },
      { fromTag: 'sewer_east_road_exit', toTag: 'sewer_east_27', direction: 'west' },
      { fromTag: 'sewer_north_64', toTag: 'sewer_cross_1', direction: 'south' },
      { fromTag: 'sewer_cross_1', toTag: 'sewer_north_64', direction: 'north' },
      { fromTag: 'sewer_north_65', toTag: 'sewer_cross_2', direction: 'south' },
      { fromTag: 'sewer_cross_2', toTag: 'sewer_north_65', direction: 'north' },
      { fromTag: 'sewer_north_67', toTag: 'sewer_central_hub', direction: 'south' },
      { fromTag: 'sewer_central_hub', toTag: 'sewer_north_67', direction: 'north' },
      { fromTag: 'sewer_north_69', toTag: 'sewer_cross_5', direction: 'south' },
      { fromTag: 'sewer_cross_5', toTag: 'sewer_north_69', direction: 'north' },
      { fromTag: 'sewer_north_71', toTag: 'sewer_east_junction', direction: 'south' },
      { fromTag: 'sewer_east_junction', toTag: 'sewer_north_71', direction: 'north' },
      { fromTag: 'sewer_north_73', toTag: 'sewer_east_hub', direction: 'south' },
      { fromTag: 'sewer_east_hub', toTag: 'sewer_north_73', direction: 'north' },
      { fromTag: 'sewer_north_74', toTag: 'sewer_cross_8', direction: 'south' },
      { fromTag: 'sewer_cross_8', toTag: 'sewer_north_74', direction: 'north' },
      { fromTag: 'sewer_cross_1', toTag: 'sewer_west_3', direction: 'south' },
      { fromTag: 'sewer_west_3', toTag: 'sewer_cross_1', direction: 'north' },
      { fromTag: 'sewer_cross_2', toTag: 'sewer_central_1', direction: 'south' },
      { fromTag: 'sewer_central_1', toTag: 'sewer_cross_2', direction: 'north' },
      { fromTag: 'sewer_cross_5', toTag: 'sewer_central_3', direction: 'south' },
      { fromTag: 'sewer_central_3', toTag: 'sewer_cross_5', direction: 'north' },
      { fromTag: 'sewer_cross_9', toTag: 'sewer_east_5', direction: 'south' },
      { fromTag: 'sewer_east_5', toTag: 'sewer_cross_9', direction: 'north' },
      { fromTag: 'sewer_cross_10', toTag: 'sewer_east_6', direction: 'south' },
      { fromTag: 'sewer_east_6', toTag: 'sewer_cross_10', direction: 'north' },
      { fromTag: 'sewer_central_7', toTag: 'sewer_south_2', direction: 'south' },
      { fromTag: 'sewer_south_2', toTag: 'sewer_central_7', direction: 'north' },
      { fromTag: 'sewer_central_9', toTag: 'sewer_south_5', direction: 'south' },
      { fromTag: 'sewer_south_5', toTag: 'sewer_central_9', direction: 'north' },
    ],

    doors: [],
  };
}
