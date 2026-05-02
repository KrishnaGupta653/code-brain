// Scala test file
package com.codebrain.test

case class User(id: Int, name: String, email: String) {
  def getDisplayName: String = s"$name ($email)"
}

trait UserService {
  def getUser(id: Int): Option[User]
  def createUser(user: User): Unit
}

class UserServiceImpl extends UserService {
  private var users: Map[Int, User] = Map.empty

  override def getUser(id: Int): Option[User] = {
    users.get(id)
  }

  override def createUser(user: User): Unit = {
    users = users + (user.id -> user)
  }
}

object UserRepository {
  private var users: List[User] = List.empty

  def addUser(user: User): Unit = {
    users = users :+ user
  }

  def findAll: List[User] = users
}

def createUser(name: String, email: String): User = {
  User(1, name, email)
}
