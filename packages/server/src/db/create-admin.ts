import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Role } from '@koa/shared';
import * as playerRepo from './repositories/playerRepository.js';
import * as roleRepo from './repositories/roleRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../../.env') });

async function createAdmin() {
  const username = process.argv[2];
  
  if (!username) {
    console.error('Usage: npx tsx src/db/create-admin.ts <username>');
    process.exit(1);
  }

  try {
    const player = await playerRepo.findPlayerByUsername(username);
    
    if (!player) {
      console.error(`Player "${username}" not found. Please register first.`);
      process.exit(1);
    }

    console.log(`Found player: ${player.username} (ID: ${player.id})`);

    // Assign Player role (required to login)
    const playerAssigned = await roleRepo.assignRole(player.id, Role.PLAYER);
    if (playerAssigned) {
      console.log('✓ Assigned Player role');
    } else {
      console.log('○ Player role already assigned or failed');
    }

    // Assign Admin role
    const adminAssigned = await roleRepo.assignRole(player.id, Role.ADMIN);
    if (adminAssigned) {
      console.log('✓ Assigned Admin role');
    } else {
      console.log('○ Admin role already assigned or failed');
    }

    // Show current roles
    const roles = await roleRepo.getPlayerRoles(player.id);
    console.log(`\nCurrent roles for ${username}: ${roles.join(', ')}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createAdmin();
